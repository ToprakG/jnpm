import semver from "semver";

export function satisfies(version: string, range: string): boolean {
  if (!semver.valid(version)) return false;
  try {
    return semver.satisfies(version, range, { includePrerelease: true });
  } catch {
    return false;
  }
}

export function intersectionEmpty(ranges: string[]): boolean {
  if (ranges.length <= 1) return false;
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      try {
        if (!semver.intersects(ranges[i], ranges[j], { includePrerelease: true })) return true;
      } catch {
        return true;
      }
    }
  }
  return false;
}

export function highestSatisfying(versions: string[], ranges: string[], peerRanges: string[] = []): string | null {
  const fitting = versions.filter(
    (version) => ranges.every((range) => satisfies(version, range)) && peerRanges.every((range) => satisfies(version, range)),
  );
  if (fitting.length === 0) return null;
  return semver.rsort(fitting)[0] ?? null;
}

export function majorsDiffer(versions: string[]): boolean {
  const majors = new Set<number>();
  for (const version of versions) {
    if (!semver.valid(version)) continue;
    majors.add(semver.major(version));
  }
  return majors.size > 1;
}

export function peerRangesFor(peers: string[], version: string): boolean {
  return peers.every((range) => satisfies(version, range));
}
