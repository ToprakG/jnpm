import { generateCandidates } from "../engine/candidates.js";
import type { Graph } from "../engine/lockfile.js";

export async function formatConflicts(graph: Graph): Promise<string> {
  const candidates = await generateCandidates(graph);
  const conflicts = candidates.filter((item) => !item.rangesOk && item.kind !== "remove");
  if (conflicts.length === 0) return "No dependency conflicts.";
  return conflicts
    .map((item) => {
      const versions = item.versions.join(", ");
      const ranges = item.ranges.join(", ");
      return `${item.name}\n  versions: ${versions}\n  ranges: ${ranges}`;
    })
    .join("\n");
}
