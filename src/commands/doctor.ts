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
  const high = candidates.filter((item) => item.kind === "review-upgrade" || (item.kind === "unsafe" && !item.rangesOk)).length;
  const medium = candidates.filter((item) => item.rangesOk && item.kind !== "remove" && item.kind !== "unsafe").length;
  const low = [...names.values()].filter((versions) => versions.size === 1).length;
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
  lines.push(
    "",
    `HIGH     ${high} conflicting dependency ${high === 1 ? "cluster" : "clusters"}`,
    `MEDIUM   ${medium} ${medium === 1 ? "duplicate that could collapse" : "duplicates that could collapse"}`,
    `LOW      ${low} single-version ${low === 1 ? "package" : "packages"}`,
  );
  return lines.join("\n");
}
