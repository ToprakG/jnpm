#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatConflicts } from "./commands/conflicts.js";
import { formatDoctor } from "./commands/doctor.js";
import { formatExplain } from "./commands/explain.js";
import { runOptimize } from "./commands/optimize.js";
import { formatTree } from "./commands/tree.js";
import { formatWhy } from "./commands/why.js";
import { loadGraph } from "./engine/lockfile.js";
import { clientFromEnv } from "./jev/client.js";
import { spawnNpm, toNpmArgs } from "./npm/run.js";

const NPM_COMMANDS = new Set([
  "install",
  "add",
  "remove",
  "update",
  "upgrade",
  "dedupe",
  "audit",
  "outdated",
  "clean",
  "prune",
  "lock",
  "ci",
  "run",
]);

const USAGE = `jnpm <command>

  install [args...]
  add <package>
  remove <package>
  update [packages...]
  upgrade <package>
  dedupe
  optimize [--show-plan] [--apply] [--install] [--json]
  doctor
  audit
  why <package>
  explain [package]
  tree
  conflicts
  outdated
  clean
  prune
  lock
  ci
  run <script>`;

export function loadDotEnv(cwd: string, env: NodeJS.ProcessEnv): void {
  let text: string;
  try {
    text = readFileSync(path.join(cwd, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
}

export async function main(argv: string[], cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  loadDotEnv(cwd, env);
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  try {
    if (NPM_COMMANDS.has(command)) {
      const mapped = toNpmArgs(command, rest);
      if ("error" in mapped) {
        console.error(mapped.error);
        return 1;
      }
      return await spawnNpm(mapped.args, cwd);
    }

    if (command === "tree") {
      console.log(formatTree(await loadGraph(cwd)));
      return 0;
    }
    if (command === "why") {
      const name = rest.find((arg) => !arg.startsWith("-"));
      if (!name) {
        console.error("usage: jnpm why <package>");
        return 1;
      }
      console.log(formatWhy(await loadGraph(cwd), name));
      return 0;
    }
    if (command === "conflicts") {
      console.log(await formatConflicts(await loadGraph(cwd)));
      return 0;
    }
    if (command === "doctor") {
      console.log(await formatDoctor(await loadGraph(cwd)));
      return 0;
    }
    if (command === "explain") {
      const name = rest.find((arg) => !arg.startsWith("-"));
      console.log(await formatExplain(cwd, name));
      return 0;
    }
    if (command === "optimize") {
      const flags = new Set(rest);
      if (flags.has("--install") && !flags.has("--apply")) {
        console.error("--install requires --apply");
        return 1;
      }
      const unknown = rest.filter((arg) => !["--show-plan", "--apply", "--install", "--json"].includes(arg));
      if (unknown.length > 0) {
        console.error(`unknown option: ${unknown[0]}`);
        return 1;
      }
      const result = await runOptimize({
        cwd,
        apply: flags.has("--apply"),
        install: flags.has("--install"),
        json: flags.has("--json"),
        client: clientFromEnv(env),
      });
      console.log(result.text);
      return result.code;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  console.error(`unknown command: ${command}\n\n${USAGE}`);
  return 1;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
