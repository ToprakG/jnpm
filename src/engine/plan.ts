import type { Candidate } from "./candidates.js";
import type { Graph } from "./lockfile.js";
import { resolveDep } from "./lockfile.js";
import type { JevJudgment, Outcome } from "../jev/policy.js";

export type Judged = Candidate & {
  outcome: Outcome;
  askedJev: boolean;
  jev: JevJudgment | null;
  packagesRemoved: number;
  bytesSaved: number | null;
};

export type Plan = {
  opportunities: number;
  judged: Judged[];
  beforePackages: number;
  afterPackages: number;
  beforeBytes: number | null;
  afterBytes: number | null;
};

const KIND_ORDER = ["dedupe", "remove", "consolidate", "replace"] as const;

export function buildPlan(graph: Graph, judged: Judged[]): Plan {
  const before = new Set(graph.nodes.map((node) => node.path));
  const after = reachableAfter(graph, judged.filter((item) => item.outcome === "apply"));
  const dropped = [...before].filter((item) => !after.has(item));
  const beforeBytes = totalBytes(graph, [...before]);
  const afterBytes = beforeBytes === null ? null : beforeBytes - (totalBytes(graph, dropped) ?? 0);

  const withSavings = judged.map((item) => {
    const alone = reachableAfter(graph, [item].filter((entry) => entry.outcome === "apply"));
    const removed = [...before].filter((path) => !alone.has(path));
    const bytes = totalBytes(graph, removed);
    return { ...item, packagesRemoved: removed.length, bytesSaved: bytes };
  });

  return {
    opportunities: judged.length,
    judged: withSavings,
    beforePackages: before.size,
    afterPackages: after.size,
    beforeBytes,
    afterBytes,
  };
}

function totalBytes(graph: Graph, paths: string[]): number | null {
  if (graph.nodes.some((node) => node.bytes === null)) return null;
  let total = 0;
  for (const packagePath of paths) {
    total += graph.byPath.get(packagePath)?.bytes ?? 0;
  }
  return total;
}

export function reachableAfter(graph: Graph, applied: Judged[]): Set<string> {
  const survivor = new Map<string, string>();
  const removedDirect = new Set<string>();
  for (const item of applied) {
    if (item.kind === "remove") removedDirect.add(item.name);
    else if (item.survivorPath) survivor.set(item.name, item.survivorPath);
  }

  const pathSet = new Set(graph.byPath.keys());
  const seen = new Set<string>();
  const visit = (from: string) => {
    const parent = from === "" ? graph.root : graph.byPath.get(from);
    if (!parent) return;
    const maps = from === ""
      ? [parent.dependencies, parent.optionalDependencies, parent.devDependencies]
      : [parent.dependencies, parent.optionalDependencies];
    const names = new Set<string>();
    for (const map of maps) {
      for (const name of Object.keys(map)) names.add(name);
    }
    for (const name of names) {
      if (from === "" && removedDirect.has(name)) continue;
      const to = survivor.get(name) ?? resolveDep(pathSet, from, name);
      if (!to || seen.has(to)) continue;
      seen.add(to);
      visit(to);
    }
  };
  visit("");
  return seen;
}

export function formatPlan(plan: Plan): string {
  const lines: string[] = [
    `Found ${plan.opportunities} optimization ${plan.opportunities === 1 ? "opportunity" : "opportunities"}.`,
  ];
  const body: string[] = [];

  for (const kind of KIND_ORDER) {
    const items = byName(plan.judged.filter((item) => item.kind === kind && item.outcome === "apply"));
    if (items.length === 0) continue;
    body.push(`✓ ${kindLine(kind, items.length)}`);
    for (const item of items) body.push(detail(item));
  }

  const reviews = byName(plan.judged.filter((item) => item.outcome === "review"));
  if (reviews.length > 0) {
    const upgrades = reviews.every((item) => item.kind === "review-upgrade");
    const noun = upgrades ? (reviews.length === 1 ? "upgrade requires" : "upgrades require") : (reviews.length === 1 ? "change requires" : "changes require");
    body.push(`⚠ ${reviews.length} ${noun} review`);
    for (const item of reviews) body.push(detail(item));
  }

  const rejected = byName(plan.judged.filter((item) => item.outcome === "reject"));
  if (rejected.length > 0) {
    body.push(`✗ ${rejected.length} ${rejected.length === 1 ? "change" : "changes"} rejected as unsafe`);
    for (const item of rejected) body.push(detail(item));
  }

  if (body.length > 0) lines.push("", ...body);

  lines.push("", "Potential:");
  if (plan.beforeBytes !== null && plan.afterBytes !== null) {
    lines.push(`  ${formatMb(plan.beforeBytes)} → ${formatMb(plan.afterBytes)}`);
  }
  lines.push(`  ${formatCount(plan.beforePackages)} packages → ${formatCount(plan.afterPackages)} packages`);
  return lines.join("\n");
}

function byName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function detail(item: Judged): string {
  if (item.kind === "remove") return `    ${item.name}`;
  if (item.outcome === "apply" && item.proposedVersion) return `    ${item.name} → ${item.proposedVersion}`;
  if (item.proposedVersion && item.jev) return `    ${item.name} → ${item.proposedVersion} (${Math.round(item.jev.noul * 100)}%)`;
  if (item.versions.length > 0) return `    ${item.name} ${item.versions.join(", ")}`;
  return `    ${item.name}`;
}

function kindLine(kind: (typeof KIND_ORDER)[number], count: number): string {
  if (kind === "dedupe") return `dedupe ${count} ${count === 1 ? "package" : "packages"}`;
  if (kind === "remove") return `remove ${count} redundant ${count === 1 ? "dependency" : "dependencies"}`;
  if (kind === "consolidate") return `consolidate ${count} version ${count === 1 ? "range" : "ranges"}`;
  return `replace ${count} unnecessary transitive ${count === 1 ? "version" : "versions"}`;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024)).toLocaleString("en-US")} MB`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function planJson(plan: Plan): unknown {
  return {
    opportunities: plan.opportunities,
    before: { packages: plan.beforePackages, bytes: plan.beforeBytes },
    after: { packages: plan.afterPackages, bytes: plan.afterBytes },
    candidates: plan.judged.map((item) => ({
      name: item.name,
      kind: item.kind,
      outcome: item.outcome,
      proposedVersion: item.proposedVersion,
      versions: item.versions,
      askedJev: item.askedJev,
      jev: item.jev,
      packagesRemoved: item.packagesRemoved,
      bytesSaved: item.bytesSaved,
    })),
  };
}
