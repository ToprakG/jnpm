import { existsSync } from "node:fs";
import path from "node:path";

export function findProjectRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "package.json")) || existsSync(path.join(current, "package-lock.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}
