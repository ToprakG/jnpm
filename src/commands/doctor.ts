import { generateCandidates } from "../engine/candidates.js";
import type { Graph } from "../engine/lockfile.js";

export async function formatDoctor(graph: Graph): Promise<string> {
  const names = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    const versions = names.get(node.name) ?? new Set<string>();
    versions.add(node.version);
    names.set(node.name, versions);
  }
  const duplicated = [...names.values()].filter((versions) => versions.size > 1).length;
  const candidates = await generateCandidates(graph);
  const conflicts = candidates
    .filter((item) => item.kind === "review-upgrade" || (item.kind === "unsafe" && !item.rangesOk))
    .sort((a, b) => a.name.localeCompare(b.name));
  const collapses = candidates
    .filter((item) => item.rangesOk && item.kind !== "remove" && item.kind !== "unsafe")
    .sort((a, b) => a.name.localeCompare(b.name));
  const unused = candidates.filter((item) => item.kind === "remove").sort((a, b) => a.name.localeCompare(b.name));
  const unsafe = candidates.filter((item) => item.kind === "unsafe").sort((a, b) => a.name.localeCompare(b.name));
  const bytes = graph.nodes.some((node) => node.bytes === null)
    ? null
    : graph.nodes.reduce((sum, node) => sum + (node.bytes ?? 0), 0);

  const lines = [
    `${graph.nodes.length.toLocaleString("en-US")} packages`,
    `${duplicated.toLocaleString("en-US")} duplicated packages`,
  ];
  if (bytes !== null) {
    lines.push(`${Math.round(bytes / (1024 * 1024)).toLocaleString("en-US")} MB dependency footprint`);
  }
  if (conflicts.length === 0 && collapses.length === 0 && unused.length === 0 && unsafe.length === 0) {
    lines.push("", "No dependency issues.");
    return lines.join("\n");
  }
  if (conflicts.length > 0) {
    lines.push("", `Conflicts (${conflicts.length})`);
    for (const item of conflicts) lines.push(`  ${item.name} ${item.versions.join(", ")}`);
  }
  if (collapses.length > 0) {
    lines.push("", `Could collapse (${collapses.length})`);
    for (const item of collapses) lines.push(`  ${item.name} → ${item.proposedVersion}`);
  }
  if (unused.length > 0) {
    lines.push("", `Unused direct dependencies (${unused.length})`);
    for (const item of unused) lines.push(`  ${item.name}`);
  }
  if (unsafe.length > 0) {
    lines.push("", `Rejected (${unsafe.length})`);
    for (const item of unsafe) lines.push(`  ${item.name} ${item.versions.join(", ")}`);
  }
  return lines.join("\n");
}
