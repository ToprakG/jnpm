import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Judged } from "../engine/plan.js";

export async function applyPlan(rootDir: string, judged: Judged[]): Promise<void> {
  const packagePath = path.join(rootDir, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const pkg = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    overrides?: Record<string, unknown>;
  };
  pkg.dependencies ??= {};
  pkg.overrides ??= {};

  for (const item of judged) {
    if (item.outcome !== "apply") continue;
    if (item.kind === "remove") {
      delete pkg.dependencies[item.name];
      continue;
    }
    if (!item.proposedVersion) continue;
    const current = pkg.overrides[item.name];
    if (current && typeof current === "object") continue;
    pkg.overrides[item.name] = item.proposedVersion;
  }

  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}
