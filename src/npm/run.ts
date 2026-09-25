import { spawn } from "node:child_process";

const NEEDS_PACKAGE = new Set(["add", "remove", "upgrade", "run"]);

export type NpmCommand =
  | { args: string[] }
  | { error: string };

function firstPositional(rest: string[]): string | undefined {
  return rest.find((arg) => arg !== "--" && !arg.startsWith("-"));
}

function toLatest(spec: string): string {
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    const versionAt = spec.indexOf("@", slash + 1);
    const name = versionAt === -1 ? spec : spec.slice(0, versionAt);
    return `${name}@latest`;
  }
  const versionAt = spec.indexOf("@");
  const name = versionAt === -1 ? spec : spec.slice(0, versionAt);
  return `${name}@latest`;
}

export function toNpmArgs(command: string, rest: string[]): NpmCommand {
  if (NEEDS_PACKAGE.has(command) && !firstPositional(rest)) {
    return { error: `usage: jnpm ${command} <${command === "run" ? "script" : "package"}>` };
  }

  switch (command) {
    case "install":
      return { args: ["install", ...rest] };
    case "add":
      return { args: ["install", ...rest] };
    case "remove":
      return { args: ["uninstall", ...rest] };
    case "update":
      return { args: ["update", ...rest] };
    case "upgrade":
      return {
        args: ["install", ...rest.map((arg) => (arg.startsWith("-") ? arg : toLatest(arg)))],
      };
    case "dedupe":
      return { args: ["dedupe", ...rest] };
    case "audit":
      return { args: ["audit", ...rest] };
    case "outdated":
      return { args: ["outdated", ...rest] };
    case "clean":
      return { args: ["cache", "clean", "--force", ...rest] };
    case "prune":
      return { args: ["prune", ...rest] };
    case "lock":
      return { args: ["install", "--package-lock-only", ...rest] };
    case "ci":
      return { args: ["ci", ...rest] };
    case "run":
      return { args: ["run", ...rest] };
    default:
      return { error: `unknown command: ${command}` };
  }
}

export function npmExecutable(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function spawnNpm(args: string[], cwd: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(npmExecutable(), args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
