import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyPlan } from "../apply/overrides.js";
import { generateCandidates } from "../engine/candidates.js";
import { loadGraph } from "../engine/lockfile.js";
import { buildPlan, formatPlan, planJson, type Judged, type Plan } from "../engine/plan.js";
import { spawnNpm } from "../npm/run.js";
import type { JevClient } from "../jev/client.js";
import { decide, type JevJudgment } from "../jev/policy.js";

export type OptimizeOptions = {
  cwd: string;
  apply: boolean;
  install: boolean;
  json: boolean;
  client: JevClient | null;
  writeLog?: boolean;
};

export async function runOptimize(options: OptimizeOptions): Promise<{ code: number; text: string; plan: Plan }> {
  const graph = await loadGraph(options.cwd);
  const candidates = await generateCandidates(graph);
  const judged: Judged[] = [];
  let model: string | null = null;

  for (const candidate of candidates) {
    const preliminary = decide({ ...candidate, jev: null });
    let jev: JevJudgment | null = null;
    let outcome = preliminary.outcome;
    let askedJev = false;
    if (preliminary.askedJev || (candidate.rangesOk && candidate.peersOk && candidate.kind !== "review-upgrade")) {
      if (!options.client) {
        const decision = decide({ ...candidate, jev: null });
        outcome = decision.outcome;
        askedJev = false;
      } else {
        try {
          jev = await options.client.judge({
            name: candidate.name,
            kind: candidate.kind,
            versions: candidate.versions,
            ranges: candidate.ranges,
            peerRanges: candidate.peerRanges,
            proposedVersion: candidate.proposedVersion,
            majorsDiffer: candidate.majorsDiffer,
          });
          model = jev.model;
          const decision = decide({ ...candidate, jev });
          outcome = decision.outcome;
          askedJev = decision.askedJev;
        } catch {
          outcome = "review";
          askedJev = false;
        }
      }
    }

    judged.push({
      ...candidate,
      outcome,
      askedJev,
      jev,
      packagesRemoved: 0,
      bytesSaved: null,
    });
  }

  const plan = buildPlan(graph, judged);
  if (options.writeLog !== false) {
    await writeDecisions(options.cwd, plan, model);
  }
  if (options.apply) {
    await applyPlan(options.cwd, plan.judged);
    if (options.install) {
      const code = await spawnNpm(["install"], options.cwd);
      if (code !== 0) return { code, text: formatPlan(plan), plan };
    }
  }
  const text = options.json ? JSON.stringify(planJson(plan), null, 2) : formatPlan(plan);
  return { code: 0, text, plan };
}

async function writeDecisions(cwd: string, plan: Plan, model: string | null): Promise<void> {
  const dir = path.join(cwd, ".jnpm");
  await mkdir(dir, { recursive: true });
  const body = {
    model,
    generatedAt: new Date().toISOString(),
    decisions: plan.judged.map((item) => ({
      name: item.name,
      kind: item.kind,
      outcome: item.outcome,
      proposedVersion: item.proposedVersion,
      versions: item.versions,
      ranges: item.ranges,
      majorsDiffer: item.majorsDiffer,
      askedJev: item.askedJev,
      jev: item.jev,
      why: item.why,
      packagesRemoved: item.packagesRemoved,
      bytesSaved: item.bytesSaved,
    })),
  };
  await writeFile(path.join(dir, "decisions.json"), `${JSON.stringify(body, null, 2)}\n`);
}
