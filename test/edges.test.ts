import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { main, loadDotEnv } from "../src/cli.js";
import { formatConflicts } from "../src/commands/conflicts.js";
import { formatDoctor } from "../src/commands/doctor.js";
import { runOptimize } from "../src/commands/optimize.js";
import { generateCandidates } from "../src/engine/candidates.js";
import { loadGraph } from "../src/engine/lockfile.js";
import { formatPlan } from "../src/engine/plan.js";
import { decide } from "../src/jev/policy.js";
import type { JevClient } from "../src/jev/client.js";

const edges = path.join(process.cwd(), "test/fixtures/edges");

const eager: JevClient = {
  async judge() {
    return { noul: 0.95, action: "apply", confidence: 0.9, model: "typesafe/jev-1.13" };
  },
};

test("edge graph classifies peers, majors, scoped names, and unused deps", async () => {
  const graph = await loadGraph(edges);
  const candidates = await generateCandidates(graph);
  const of = (name: string) => candidates.find((item) => item.name === name);
  assert.equal(of("@acme/widget")?.kind, "dedupe");
  assert.equal(of("@acme/widget")?.proposedVersion, "1.2.0");
  assert.equal(of("minimist")?.kind, "dedupe");
  assert.equal(of("minimist")?.proposedVersion, "1.2.6");
  assert.equal(of("chalk")?.kind, "review-upgrade");
  assert.equal(of("tiny")?.kind, "review-upgrade");
  assert.equal(of("starry")?.kind, "dedupe");
  assert.equal(of("starry")?.majorsDiffer, true);
  assert.equal(of("ghost")?.kind, "remove");
  assert.equal(of("react")?.kind, "remove");
  assert.equal(of("eslint"), undefined);
  assert.equal(of("fsevents"), undefined);
  assert.equal(of("needed-cjs"), undefined);
  assert.equal(of("@acme/used"), undefined);
  assert.equal(of("left-pad"), undefined);
  assert.equal(of("react-dom"), undefined);

  const conflicts = await formatConflicts(graph);
  assert.match(conflicts, /chalk/);
  assert.match(conflicts, /tiny/);
  assert.doesNotMatch(conflicts, /minimist/);
  const doctor = await formatDoctor(graph);
  assert.match(doctor, /HIGH\s+2 conflicting/);
  assert.match(doctor, /MEDIUM\s+3 duplicates/);
});

test("a major bump and a peer-safe lower version follow the ceiling", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "jnpm-edge-"));
  await cp(edges, cwd, { recursive: true });
  const result = await runOptimize({ cwd, apply: true, install: false, json: false, client: eager });
  const outcome = (name: string) => result.plan.judged.find((item) => item.name === name);
  assert.equal(outcome("minimist")?.outcome, "apply");
  assert.equal(outcome("starry")?.outcome, "review");
  assert.equal(outcome("starry")?.askedJev, true);
  assert.equal(outcome("chalk")?.askedJev, false);
  assert.equal(outcome("ghost")?.outcome, "apply");
  assert.equal(outcome("react")?.outcome, "apply");
  assert.match(result.text, /minimist → 1\.2\.6/);
  assert.match(formatPlan(result.plan), /starry → 2\.0\.0 \(95%\)/);

  const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    optionalDependencies: Record<string, string>;
    overrides: Record<string, unknown>;
  };
  assert.equal(pkg.overrides.minimist, "1.2.6");
  assert.equal(pkg.overrides["@acme/widget"], "1.2.0");
  assert.equal(pkg.overrides.starry, undefined);
  assert.equal(pkg.overrides.chalk, undefined);
  assert.equal(pkg.overrides["kept-string"], "1.0.0");
  assert.deepEqual(pkg.overrides["kept-object"], { "readable-stream": "2.0.0" });
  assert.equal(pkg.dependencies.ghost, undefined);
  assert.equal(pkg.dependencies.react, undefined);
  assert.equal(pkg.dependencies["react-dom"], "^18.0.0");
  assert.equal(pkg.dependencies["needed-cjs"], "^1.0.0");
  assert.equal(pkg.devDependencies.eslint, "^8.0.0");
  assert.equal(pkg.optionalDependencies.fsevents, "^2.0.0");
});

test("recorded Jev probabilities reproduce the live fixture decisions", () => {
  const live = [
    { name: "debug", noul: 0.86, action: "apply" as const, expected: "apply" },
    { name: "once", noul: 0.83, action: "apply" as const, expected: "review" },
    { name: "ms", noul: 0.84, action: "apply" as const, expected: "review" },
    { name: "unused-lib", noul: 0.4, action: "apply" as const, expected: "reject" },
  ];
  for (const row of live) {
    const decision = decide({
      rangesOk: true,
      peersOk: true,
      majorsDiffer: false,
      kind: "dedupe",
      jev: { noul: row.noul, action: row.action, confidence: 0.5, model: "typesafe/jev-1.13-20260917" },
    });
    assert.equal(decision.outcome, row.expected, row.name);
  }
});

test("lockfile v2 loads and v1 is rejected", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "jnpm-lock-"));
  await writeFile(path.join(cwd, "package-lock.json"), JSON.stringify({
    lockfileVersion: 2,
    packages: {
      "": { name: "v2-app", version: "1.0.0", dependencies: { left: "^1.0.0" } },
      "node_modules/left": { version: "1.2.0" },
    },
  }));
  const graph = await loadGraph(cwd);
  assert.equal(graph.nodes[0]?.name, "left");

  const broken = await mkdtemp(path.join(tmpdir(), "jnpm-lock-"));
  await writeFile(path.join(broken, "package-lock.json"), JSON.stringify({ lockfileVersion: 1, dependencies: {} }));
  await assert.rejects(() => loadGraph(broken), /lockfileVersion 1/);
});

test("cli usage and a missing lockfile", async () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  try {
    assert.equal(await main(["optimize", "--install"], process.cwd(), {}), 1);
    assert.match(errors.join("\n"), /--install requires --apply/);
    const empty = await mkdtemp(path.join(tmpdir(), "jnpm-empty-"));
    assert.equal(await main(["optimize"], empty, {}), 1);
    assert.match(errors.join("\n"), /package-lock.json not found/);
    assert.equal(await main(["nope"], empty, {}), 1);
  } finally {
    console.error = original;
  }
});

test("dotenv accepts export and does not override the environment", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "jnpm-env-"));
  await writeFile(path.join(cwd, ".env"), "export OPENROUTER_API_KEY=from-file\nALREADY=from-file\n");
  const env: NodeJS.ProcessEnv = { ALREADY: "from-env" };
  loadDotEnv(cwd, env);
  assert.equal(env.OPENROUTER_API_KEY, "from-file");
  assert.equal(env.ALREADY, "from-env");
});
