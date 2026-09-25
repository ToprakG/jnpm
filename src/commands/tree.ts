import type { Graph } from "../engine/lockfile.js";

export function formatTree(graph: Graph): string {
  const lines = [`${graph.root.name}@${graph.root.version}`];
  const walk = (from: string, prefix: string, seen: Set<string>) => {
    const edges = graph.edges.filter((edge) => edge.from === from);
    edges.forEach((edge, index) => {
      const last = index === edges.length - 1;
      const node = graph.byPath.get(edge.to);
      lines.push(`${prefix}${last ? "└─ " : "├─ "}${edge.name}@${node?.version ?? "?"} ${edge.range}`);
      if (seen.has(edge.to)) return;
      seen.add(edge.to);
      walk(edge.to, prefix + (last ? "   " : "│  "), seen);
      seen.delete(edge.to);
    });
  };
  walk("", "", new Set());
  return lines.join("\n");
}
