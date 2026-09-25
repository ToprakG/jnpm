import { whyLines } from "../engine/candidates.js";
import type { Graph } from "../engine/lockfile.js";

export function formatWhy(graph: Graph, name: string): string {
  const versions = graph.nodes.filter((node) => node.name === name);
  if (versions.length === 0) return `No dependency named ${name}`;
  const header = versions.map((node) => `${node.name}@${node.version}`).join("\n");
  const paths = whyLines(graph, name);
  return paths.length > 0 ? `${header}\n${paths.join("\n")}` : header;
}
