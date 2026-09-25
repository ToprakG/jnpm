import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export type DepMap = Record<string, string>;

export type PackageNode = {
  path: string;
  name: string;
  version: string;
  dependencies: DepMap;
  optionalDependencies: DepMap;
  peerDependencies: DepMap;
  devDependencies: DepMap;
  bytes: number | null;
};

export type Edge = {
  from: string;
  to: string;
  name: string;
  range: string;
};

export type Graph = {
  rootDir: string;
  root: PackageNode;
  nodes: PackageNode[];
  byPath: Map<string, PackageNode>;
  edges: Edge[];
};

type LockPackage = {
  name?: string;
  version?: string;
  dependencies?: DepMap;
  optionalDependencies?: DepMap;
  peerDependencies?: DepMap;
  devDependencies?: DepMap;
  link?: boolean;
};

type Lockfile = {
  lockfileVersion?: number;
  packages?: Record<string, LockPackage>;
};

function depsOf(pkg: LockPackage | undefined, key: "dependencies" | "optionalDependencies" | "peerDependencies" | "devDependencies"): DepMap {
  return { ...(pkg?.[key] ?? {}) };
}

export function nameFromPath(packagePath: string): string {
  const parts = packagePath.split("node_modules/");
  return parts[parts.length - 1] ?? packagePath;
}

export function resolveDep(paths: Set<string>, parentPath: string, name: string): string | null {
  let current = parentPath;
  while (true) {
    const candidate = current ? `${current}/node_modules/${name}` : `node_modules/${name}`;
    if (paths.has(candidate)) return candidate;
    if (!current) return null;
    const nested = current.lastIndexOf("/node_modules/");
    if (nested === -1) {
      current = "";
      continue;
    }
    current = current.slice(0, nested);
  }
}

async function directoryBytes(dir: string): Promise<number | null> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) return info.size;
  } catch {
    return null;
  }

  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await directoryBytes(full);
      total += nested ?? 0;
    } else if (entry.isFile()) {
      const file = await stat(full);
      total += file.size;
    }
  }
  return total;
}

export async function loadGraph(rootDir: string): Promise<Graph> {
  const lockPath = path.join(rootDir, "package-lock.json");
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch {
    throw new Error("package-lock.json not found");
  }

  const lock = JSON.parse(raw) as Lockfile;
  const version = lock.lockfileVersion ?? 0;
  if (version !== 2 && version !== 3) {
    throw new Error(`unsupported lockfileVersion ${version}; JNPM reads npm lockfile v2 and v3`);
  }
  const packages = lock.packages ?? {};
  const rootPkg = packages[""] ?? {};
  const moduleRoot = path.join(rootDir, "node_modules");
  let modulesExist = false;
  try {
    modulesExist = (await stat(moduleRoot)).isDirectory();
  } catch {
    modulesExist = false;
  }

  const nodes: PackageNode[] = [];
  for (const [packagePath, pkg] of Object.entries(packages)) {
    if (packagePath === "" || pkg.link) continue;
    const versionText = pkg.version;
    if (!versionText) continue;
    const name = pkg.name || nameFromPath(packagePath);
    const bytes = modulesExist ? await directoryBytes(path.join(rootDir, packagePath)) : null;
    nodes.push({
      path: packagePath,
      name,
      version: versionText,
      dependencies: depsOf(pkg, "dependencies"),
      optionalDependencies: depsOf(pkg, "optionalDependencies"),
      peerDependencies: depsOf(pkg, "peerDependencies"),
      devDependencies: depsOf(pkg, "devDependencies"),
      bytes,
    });
  }

  const root: PackageNode = {
    path: "",
    name: rootPkg.name || "app",
    version: rootPkg.version || "0.0.0",
    dependencies: depsOf(rootPkg, "dependencies"),
    optionalDependencies: depsOf(rootPkg, "optionalDependencies"),
    peerDependencies: depsOf(rootPkg, "peerDependencies"),
    devDependencies: depsOf(rootPkg, "devDependencies"),
    bytes: null,
  };

  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const pathSet = new Set(byPath.keys());
  const edges: Edge[] = [];

  const linkFrom = (parent: PackageNode, maps: DepMap[]) => {
    const seen = new Set<string>();
    for (const map of maps) {
      for (const [name, range] of Object.entries(map)) {
        if (seen.has(name)) continue;
        seen.add(name);
        const to = resolveDep(pathSet, parent.path, name);
        if (!to) continue;
        edges.push({ from: parent.path, to, name, range });
      }
    }
  };

  linkFrom(root, [root.dependencies, root.optionalDependencies, root.devDependencies]);
  for (const node of nodes) {
    linkFrom(node, [node.dependencies, node.optionalDependencies]);
  }

  return { rootDir, root, nodes, byPath, edges };
}

export function allRequirementMaps(node: PackageNode): DepMap[] {
  return [node.dependencies, node.optionalDependencies, node.devDependencies, node.peerDependencies];
}
