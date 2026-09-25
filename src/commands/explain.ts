import { readFile } from "node:fs/promises";
import path from "node:path";

type Logged = {
  model: string | null;
  decisions: Array<{
    name: string;
    kind: string;
    outcome: string;
    proposedVersion: string | null;
    askedJev: boolean;
    jev: { noul: number; action: string; confidence: number; model: string } | null;
    why: string[];
  }>;
};

export async function formatExplain(cwd: string, name?: string): Promise<string> {
  const logPath = path.join(cwd, ".jnpm", "decisions.json");
  let raw: string;
  try {
    raw = await readFile(logPath, "utf8");
  } catch {
    return "No decision log. Run jnpm optimize first.";
  }
  const log = JSON.parse(raw) as Logged;
  const decisions = name ? log.decisions.filter((item) => item.name === name) : log.decisions;
  if (decisions.length === 0) return name ? `No decision for ${name}` : "No decisions in the last optimize run.";

  return decisions
    .map((item) => {
      const lines = [
        item.proposedVersion ? `${item.name}@${item.proposedVersion}` : item.name,
        `  kind: ${item.kind}`,
        `  outcome: ${item.outcome}`,
      ];
      if (item.jev) {
        lines.push(`  compatible: ${(item.jev.noul * 100).toFixed(0)}%`);
        lines.push(`  action: ${item.jev.action}`);
        lines.push(`  model: ${item.jev.model}`);
      } else if (log.model) {
        lines.push(`  model: ${log.model}`);
      }
      if (!item.askedJev) lines.push("  jev: not asked");
      if (item.why.length > 0) {
        lines.push("  why:");
        for (const line of item.why) lines.push(`    ${line}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
