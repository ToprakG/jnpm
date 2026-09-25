import semver from "semver";
import type { Graph, PackageNode } from "./lockfile.js";
import { packageReferencedInSource } from "./source.js";
import { highestSatisfying, intersectionEmpty, majorsDiffer } from "./safety.js";

export type CandidateKind =
  | "dedupe"
  | "remove"
  | "consolidate"
  | "replace"
  | "review-upgrade"
  | "unsafe";

export type Candidate = {
  name: string;
  kind: CandidateKind;
  versions: string[];
  ranges: string[];
  peerRanges: string[];
  proposedVersion: string | null;
  survivorPath: string | null;
  rangesOk: boolean;
  peersOk: boolean;
  majorsDiffer: boolean;
  why: string[];
};

export async function generateCandidates(graph: Graph): Promise<Candidate[]> {
  const byName = new Map<string, PackageNode[]>();
  for (const node of graph.nodes) {
    const list = byName.get(node.name) ?? [];
    list.push(node);
    byName.set(node.name, list);
  }

  const candidates: Candidate[] = [];
  for (const [name, instances] of byName) {
    const versions = [...new Set(instances.map((node) => node.version))];
    if (versions.length < 2) continue;
    candidates.push(versionCandidate(graph, name, instances, versions));
  }

  const removable = await removeCandidates(graph, byName);
  return [...candidates, ...removable];
}

function versionCandidate(graph: Graph, name: string, instances: PackageNode[], versions: string[]): Candidate {
  const ranges = parentRanges(graph, name);
  const peerRanges = collectPeerRanges(graph, name);
  const rangeFit = highestSatisfying(versions, ranges);
  const proposed = highestSatisfying(versions, ranges, peerRanges);
  const rangesOk = rangeFit !== null;
  const peersOk = proposed !== null;
  const majors = majorsDiffer(versions);
  const why = whyLines(graph, name);

  let kind: CandidateKind;
  if (!peersOk && rangesOk) kind = "unsafe";
  else if (!rangesOk) kind = majors || intersectionEmpty(ranges) ? "review-upgrade" : "unsafe";
  else {
    const uniqueRanges = [...new Set(ranges)];
    const rootDirect = Object.prototype.hasOwnProperty.call(graph.root.dependencies, name);
    const nestedExtra = instances.some((node) => node.path.split("node_modules/").length > 2);
    if (uniqueRanges.length > 1) kind = "consolidate";
    else if (!rootDirect && nestedExtra) kind = "replace";
    else kind = "dedupe";
  }

  const survivor = proposed
    ? instances
        .filter((node) => node.version === proposed)
        .sort((a, b) => a.path.length - b.path.length)[0]
    : undefined;

  return {
    name,
    kind,
    versions: semver.rsort(versions.filter((version) => semver.valid(version))),
    ranges,
    peerRanges,
    proposedVersion: rangesOk ? proposed : null,
    survivorPath: survivor?.path ?? null,
    rangesOk,
    peersOk: rangesOk ? peersOk : false,
    majorsDiffer: majors,
    why,
  };
}

async function removeCandidates(graph: Graph, byName: Map<string, PackageNode[]>): Promise<Candidate[]> {
  const found: Candidate[] = [];
  for (const [name, range] of Object.entries(graph.root.dependencies)) {
    const instances = byName.get(name) ?? [];
    if (new Set(instances.map((node) => node.version)).size > 1) continue;
    const dependedOnByOther = graph.edges.some((edge) => edge.name === name && edge.from !== "");
    if (dependedOnByOther) continue;
    const peerNeed = graph.nodes.some((node) => node.peerDependencies[name]);
    if (peerNeed) continue;
    if (await packageReferencedInSource(graph.rootDir, name)) continue;
    const version = instances[0]?.version ?? null;
    found.push({
      name,
      kind: "remove",
      versions: version ? [version] : [],
      ranges: [range],
      peerRanges: [],
      proposedVersion: null,
      survivorPath: null,
      rangesOk: true,
      peersOk: true,
      majorsDiffer: false,
      why: whyLines(graph, name),
    });
  }
  return found;
}

function parentRanges(graph: Graph, name: string): string[] {
  return graph.edges.filter((edge) => edge.name === name).map((edge) => edge.range);
}

function collectPeerRanges(graph: Graph, name: string): string[] {
  const ranges: string[] = [];
  const consider = [graph.root, ...graph.nodes];
  for (const node of consider) {
    const range = node.peerDependencies[name];
    if (range) ranges.push(range);
  }
  return ranges;
}

export function whyPaths(graph: Graph, name: string): string[][] {
  const paths: string[][] = [];
  const walk = (from: string, chain: string[], seen: Set<string>) => {
    for (const edge of graph.edges.filter((item) => item.from === from)) {
      const node = graph.byPath.get(edge.to);
      const label = `${edge.name}@${node?.version ?? "?"} ${edge.range}`;
      if (edge.name === name) {
        paths.push([...chain, label]);
        continue;
      }
      if (seen.has(edge.to)) continue;
      seen.add(edge.to);
      walk(edge.to, [...chain, label], seen);
      seen.delete(edge.to);
    }
  };
  walk("", [graph.root.name], new Set());
  return paths;
}

export function formatPaths(paths: string[][]): string[] {
  return paths.flatMap((segments) => {
    return segments.map((segment, index) => {
      if (index === 0) return segment;
      return `${"   ".repeat(index - 1)}└─ ${segment}`;
    });
  });
}

export function whyLines(graph: Graph, name: string): string[] {
  return formatPaths(whyPaths(graph, name));
}
