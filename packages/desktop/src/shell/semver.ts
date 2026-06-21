// Minimal semver compare for plain `major.minor.patch` strings (optionally with
// a leading `v` and a `-prerelease` suffix that we treat as lower-precedence).
// No dependency — the versions we deal with are simple release tags.
function parse(v: string): { nums: [number, number, number]; pre: string } {
  const clean = v.trim().replace(/^v/, '');
  const dash = clean.indexOf('-');
  const core = dash === -1 ? clean : clean.slice(0, dash);
  const pre = dash === -1 ? '' : clean.slice(dash + 1);
  const parts = core.split('.');
  const at = (i: number): number => Number(parts[i] ?? 0) || 0;
  return { nums: [at(0), at(1), at(2)], pre };
}

// -1 if a<b, 0 if equal, 1 if a>b.
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const na = pa.nums[i] ?? 0;
    const nb = pb.nums[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  // A release (no prerelease) outranks a prerelease of the same core.
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
}

export function isNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function gte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

export function satisfiesMinShellVersion(appVersion: string, minShellVersion: string): boolean {
  if (gte(appVersion, minShellVersion)) return true;
  const pa = parse(appVersion);
  const pb = parse(minShellVersion);
  return pa.nums[0] === pb.nums[0] && pa.nums[1] === pb.nums[1];
}
