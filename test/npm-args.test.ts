import assert from "node:assert/strict";
import test from "node:test";
import { toNpmArgs } from "../src/npm/run.js";

test("install forwards arguments", () => {
  assert.deepEqual(toNpmArgs("install", ["--omit=dev"]), { args: ["install", "--omit=dev"] });
});

test("add and remove map onto npm install and uninstall", () => {
  assert.deepEqual(toNpmArgs("add", ["lodash", "--save-dev"]), { args: ["install", "lodash", "--save-dev"] });
  assert.deepEqual(toNpmArgs("remove", ["lodash"]), { args: ["uninstall", "lodash"] });
});

test("upgrade requests latest", () => {
  assert.deepEqual(toNpmArgs("upgrade", ["lodash"]), { args: ["install", "lodash@latest"] });
  assert.deepEqual(toNpmArgs("upgrade", ["@scope/pkg"]), { args: ["install", "@scope/pkg@latest"] });
});

test("package commands require a positional argument", () => {
  assert.deepEqual(toNpmArgs("add", []), { error: "usage: jnpm add <package>" });
  assert.deepEqual(toNpmArgs("run", ["--silent"]), { error: "usage: jnpm run <script>" });
});

test("the remaining npm commands keep their flags", () => {
  assert.deepEqual(toNpmArgs("update", ["react"]), { args: ["update", "react"] });
  assert.deepEqual(toNpmArgs("dedupe", []), { args: ["dedupe"] });
  assert.deepEqual(toNpmArgs("audit", ["--json"]), { args: ["audit", "--json"] });
  assert.deepEqual(toNpmArgs("outdated", []), { args: ["outdated"] });
  assert.deepEqual(toNpmArgs("clean", []), { args: ["cache", "clean", "--force"] });
  assert.deepEqual(toNpmArgs("prune", []), { args: ["prune"] });
  assert.deepEqual(toNpmArgs("lock", []), { args: ["install", "--package-lock-only"] });
  assert.deepEqual(toNpmArgs("ci", []), { args: ["ci"] });
  assert.deepEqual(toNpmArgs("run", ["test", "--", "--watch"]), { args: ["run", "test", "--", "--watch"] });
});
