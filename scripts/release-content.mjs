#!/usr/bin/env node
// Bumps the patch version of the web, api and shared packages, commits the
// change, then creates and pushes a `content-v<version>` tag.
//
// Usage: node scripts/release-content.mjs
//   --major / --minor / --patch   which segment to bump (default: patch)
//   --dry-run                     print actions without writing/pushing

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["web", "api", "shared"];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const segment = args.has("--major")
  ? "major"
  : args.has("--minor")
    ? "minor"
    : "patch";

function run(cmd, cmdArgs) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  if (dryRun) return "";
  return execFileSync(cmd, cmdArgs, { cwd: root, stdio: "pipe" })
    .toString()
    .trim();
}

function bump(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  if ([major, minor, patch].some(Number.isNaN)) {
    throw new Error(`Cannot parse version "${version}"`);
  }
  if (segment === "major") return `${major + 1}.0.0`;
  if (segment === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Ensure a clean working tree so the version commit is self-contained.
const status = execFileSync("git", ["status", "--porcelain"], { cwd: root })
  .toString()
  .trim();
if (status && !dryRun) {
  console.error("Working tree is not clean. Commit or stash changes first.");
  process.exit(1);
}

// Read current versions and make sure they agree.
const paths = {};
const versions = new Set();
for (const pkg of packages) {
  const p = join(root, "packages", pkg, "package.json");
  paths[pkg] = p;
  const json = JSON.parse(readFileSync(p, "utf8"));
  versions.add(json.version);
}
if (versions.size !== 1) {
  throw new Error(
    `Packages are out of sync: ${[...versions].join(", ")}. Align them first.`,
  );
}

const current = [...versions][0];
const next = bump(current);
const tag = `content-v${next}`;
console.log(`Bumping ${segment}: ${current} -> ${next}`);

// Write the new version into each package.json.
for (const pkg of packages) {
  const p = paths[pkg];
  const raw = readFileSync(p, "utf8");
  const updated = raw.replace(
    /("version":\s*")[^"]+(")/,
    `$1${next}$2`,
  );
  if (updated === raw) throw new Error(`No version field updated in ${p}`);
  if (dryRun) {
    console.log(`Would update ${pkg}/package.json -> ${next}`);
  } else {
    writeFileSync(p, updated);
    console.log(`Updated ${pkg}/package.json -> ${next}`);
  }
}

// Commit, tag and push.
run("git", ["add", ...packages.map((pkg) => `packages/${pkg}/package.json`)]);
run("git", ["commit", "-m", `Bump web, api, shared to ${next}`]);
run("git", ["tag", tag]);
run("git", ["push"]);
run("git", ["push", "origin", tag]);

console.log(`\nDone. Released ${next} and pushed tag ${tag}.`);
