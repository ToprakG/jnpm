import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateCandidates } from "../src/engine/candidates.js";
import { loadGraph } from "../src/engine/lockfile.js";
import { formatPlan } from "../src/engine/plan.js";
import { runOptimize } from "../src/commands/optimize.js";
import { formatDoctor } from "../src/commands/doctor.js";
import type { JevClient } from "../src/jev/client.js";

const fixture = path.join(process.cwd(), "test/fixtures/project");

const fakeJev: JevClient = {
  async judge() {
    return { noul: 0.95, action: "apply", confidence: 0.9, model: "typesafe/jev-1.13" };
  },
};

test("the fixture yields one candidate of each kind", async () => {
  const graph = await loadGraph(fixture);
  const candidates = await generateCandidates(graph);
  const kindOf = (name: string) => candidates.find((item) => item.name === name)?.kind;
  assert.equal(kindOf("debug"), "dedupe");
  assert.equal(kindOf("ms"), "consolidate");
  assert.equal(kindOf("once"), "replace");
  assert.equal(kindOf("unused-lib"), "remove");
  assert.equal(kindOf("react"), "review-upgrade");
  assert.equal(kindOf("host"), "unsafe");
  const doctor = await formatDoctor(graph);
  assert.match(doctor, /Rejected \(1\)/);
  assert.match(doctor, /host 1\.2\.0, 1\.1\.0/);
});

test("optimize --show-plan prints the demo shape", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "jnpm-"));
  await cp(fixture, cwd, { recursive: true });
  const result = await runOptimize({ cwd, apply: false, install: false, json: false, client: fakeJev });
  assert.equal(result.text, formatPlan(result.plan));
  assert.equal(
    result.text,
    [
      "Found 6 optimization opportunities.",
      "",
      "✓ dedupe 1 package",
      "    debug → 4.3.4",
      "✓ remove 1 redundant dependency",
      "    unused-lib",
      "✓ consolidate 1 version range",
      "    ms → 2.1.3",
      "✓ replace 1 unnecessary transitive version",
      "    once → 1.4.0",
      "⚠ 1 upgrade requires review",
      "    react 19.0.0, 18.3.1",
      "✗ 1 change rejected as unsafe",
      "    host 1.2.0, 1.1.0",
      "",
      "Potential:",
      "  18 packages → 14 packages",
    ].join("\n"),
  );
});

test("optimize --apply writes overrides and drops the unused dependency", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "jnpm-"));
  await cp(fixture, cwd, { recursive: true });
  await runOptimize({ cwd, apply: true, install: false, json: false, client: fakeJev });
  const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    overrides: Record<string, string>;
  };
  assert.equal(pkg.dependencies["unused-lib"], undefined);
  assert.equal(pkg.overrides.debug, "4.3.4");
  assert.equal(pkg.overrides.ms, "2.1.3");
  assert.equal(pkg.overrides.once, "1.4.0");
  assert.equal(pkg.overrides.react, undefined);
  assert.equal(pkg.overrides.host, undefined);
});
