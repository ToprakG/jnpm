import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-test", ".git", ".jnpm"]);

function patternFor(name: string): RegExp[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tail = "(?:['\"]|/)";
  return [
    new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${escaped}${tail}`),
    new RegExp(`require\\(\\s*['"]${escaped}${tail}`),
  ];
}

export async function packageReferencedInSource(rootDir: string, name: string): Promise<boolean> {
  const patterns = patternFor(name);
  const files = await sourceFiles(rootDir);
  for (const file of files) {
    let text: string;
    try {
      const info = await stat(file);
      if (info.size > 1_000_000) continue;
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(text))) return true;
  }
  return false;
}

async function sourceFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(full)));
    else if (SOURCE_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}
