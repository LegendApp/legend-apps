#!/usr/bin/env bun
// Dev-machine workflow: pull legend-spark and legend-apps from the machine
// registered as `dev`, repack the local Spark SDK when Spark's sources moved,
// point the workspace catalog at the packed archive, then run an app through it.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const sparkRoot = process.env.LEGEND_SPARK_ROOT ?? path.resolve(rootDir, "../legend-spark");
const [appId = "slides", ...argv] = process.argv.slice(2);
if (!argv.includes("--skip-pull")) {
  for (const repo of [rootDir, sparkRoot]) pullFromDev(repo);
}
const packageFile = path.join(rootDir, "package.json");
const manifestFile = path.join(sparkRoot, "artifacts/packages/manifest.json");
// Packed archives are not byte-reproducible: their filenames are content hashes
// and tar records fresh mtimes, so the last packed commit is the change signal.
const markerFile = path.join(sparkRoot, ".spark/sync-sdk.json");

function pullFromDev(repo: string) {
  const remote = process.env.LEGEND_SYNC_REMOTE ?? "dev";
  const branch = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!git(repo, ["remote", "get-url", remote])) {
    console.error(`${path.basename(repo)} has no '${remote}' remote; add it or set LEGEND_SYNC_REMOTE.`);
    process.exit(1);
  }
  // Fast-forward only: local work on top of dev or a diverged branch needs a
  // human rebase, not a surprise merge commit from a launcher script.
  if (spawnSync("git", ["pull", "--ff-only", remote, branch], { cwd: repo, stdio: "inherit" }).status !== 0) {
    console.error(`${path.basename(repo)} could not fast-forward ${branch} from ${remote}; reconcile it first.`);
    process.exit(1);
  }
}

function git(repo: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8")) as any;
}

const head = git(sparkRoot, ["rev-parse", "HEAD"]) || "unknown";
const packed = existsSync(markerFile) ? readJson(markerFile) : undefined;
if (!existsSync(manifestFile) || packed?.sparkHead !== head || packed?.archive !== readJson(manifestFile)["@legendapp/spark"]) {
  console.log(`Packing the local Spark SDK at ${head.slice(0, 7)}…`);
  if (spawnSync("npm", ["run", "pack:local"], { cwd: sparkRoot, stdio: "inherit" }).status !== 0) process.exit(1);
  const archive = readJson(manifestFile)["@legendapp/spark"] as string;
  writeFileSync(markerFile, JSON.stringify({ sparkHead: head, archive }, null, 2) + "\n");
} else {
  console.log(`Spark SDK is current for ${head.slice(0, 7)}.`);
}

const repo = readJson(packageFile);
const pinned = repo.catalog?.["@legendapp/spark"] as string | undefined;
if (typeof pinned !== "string" || !pinned.startsWith("file:")) {
  console.error("The workspace catalog must select a local Spark SDK archive.");
  process.exit(1);
}
const selected = `file:${path.relative(rootDir, path.join(sparkRoot, "artifacts/packages", readJson(manifestFile)["@legendapp/spark"]))}`;
if (selected !== pinned) {
  const next = readJson(packageFile);
  next.catalog["@legendapp/spark"] = selected;
  const formatted = `${JSON.stringify(next, null, 2)}\n`;
  if (JSON.stringify(JSON.parse(formatted)) !== JSON.stringify(next)) {
    console.error(`${packageFile} is not in the two-space JSON shape this script preserves; update the catalog pin by hand.`);
    process.exit(1);
  }
  console.log(`Pinning @legendapp/spark to ${selected}`);
  writeFileSync(packageFile, formatted);
}

if (argv.includes("--no-run")) console.log(`SDK ready; would run ${appId} with: bun run spark ${appId} run`);
else if (spawnSync("bun", ["run", "spark", appId, "run"], { cwd: rootDir, stdio: "inherit" }).status !== 0) process.exit(1);
