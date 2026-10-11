#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = realpathSync(path.resolve(import.meta.dirname, ".."));
const remote = process.env.LEGEND_SYNC_REMOTE ?? "dev";
const args = process.argv.slice(2);
const flags = new Set(args.filter(arg => arg.startsWith("--")));
const apps = args.filter(arg => !arg.startsWith("--"));
if (flags.has("--help")) {
  console.log("Usage: bun run spark:sync [app=slides] [--skip-pull] [--no-run]\nPull both checkouts from dev, pack changed Spark sources, update spark.local.json, and run a macOS dev build.\nLEGEND_SPARK_ROOT overrides the sibling SDK checkout; LEGEND_SYNC_REMOTE overrides dev.");
  process.exit(0);
}
if (apps.length > 1 || [...flags].some(flag => !["--skip-pull", "--no-run"].includes(flag))) {
  throw new Error("Usage: bun run spark:sync [app=slides] [--skip-pull] [--no-run]");
}
const appId = apps[0] ?? "slides";
const sparkRoot = realpathSync(path.resolve(process.env.LEGEND_SPARK_ROOT ?? path.join(rootDir, "../legend-spark")));
const packageFile = path.join(rootDir, "package.json");
const localFile = path.join(rootDir, "spark.local.json");
const manifestFile = path.join(sparkRoot, "artifacts/packages/manifest.json");
const markerFile = path.join(sparkRoot, ".spark/sync-sdk.json");

function run(repo: string, command: string, argv: string[], capture = false) {
  const result = spawnSync(command, argv, { cwd: repo, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(repo)}: ${command} ${argv.join(" ")} failed${capture ? `: ${result.stderr.trim()}` : ""}`);
  return result.stdout?.trim() ?? "";
}

function git(repo: string, argv: string[]) {
  return run(repo, "git", argv, true);
}

function readJson(file: string) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readCache(file: string) {
  try { return readJson(file); }
  catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function withPin(source: string, pin: string) {
  const value = JSON.parse(source);
  value.catalog["@legendapp/spark"] = pin;
  return `${JSON.stringify(value, null, 2)}\n`;
}

function archivesPresent(manifest: unknown): manifest is Record<string, string> {
  return !!manifest && typeof manifest === "object" && "@legendapp/spark" in manifest &&
    Object.values(manifest).every(file => typeof file === "string" && file.endsWith(".tgz") && existsSync(path.resolve(path.dirname(manifestFile), file)));
}

if (git(sparkRoot, ["status", "--porcelain"])) throw new Error("Commit or stash local Spark changes before syncing so the packed SDK matches its commit.");
if (!flags.has("--skip-pull")) {
  const branches = [sparkRoot, rootDir].map(repo => {
    const branch = git(repo, ["branch", "--show-current"]);
    if (!branch) throw new Error(`${path.basename(repo)} has a detached HEAD; check out a branch before syncing.`);
    git(repo, ["remote", "get-url", remote]);
    return { repo, branch };
  });
  const source = readFileSync(packageFile, "utf8");
  const committed = git(rootDir, ["show", "HEAD:package.json"]);
  if (JSON.stringify(JSON.parse(source)) !== JSON.stringify(JSON.parse(committed)) ||
      git(rootDir, ["diff", "--cached", "--name-only", "--", "package.json"])) {
    throw new Error("Commit or stash package.json edits before syncing.");
  }
  for (const { repo, branch } of branches) run(repo, "git", ["pull", "--ff-only", remote, branch]);
}

const head = git(sparkRoot, ["rev-parse", "HEAD"]);
const packed = readCache(markerFile);
let manifest = readCache(manifestFile);
if (!archivesPresent(manifest) || packed?.sparkHead !== head || packed?.archive !== manifest["@legendapp/spark"]) {
  console.log(`Packing the local Spark SDK at ${head.slice(0, 7)}…`);
  run(sparkRoot, "bun", ["install", "--frozen-lockfile"]);
  run(sparkRoot, "bun", ["run", "pack:local"]);
  manifest = readJson(manifestFile);
  if (!archivesPresent(manifest)) throw new Error("Packing did not produce the SDK archives listed in manifest.json.");
  if (git(sparkRoot, ["rev-parse", "HEAD"]) !== head || git(sparkRoot, ["status", "--porcelain"])) {
    throw new Error("Spark sources changed during packing; retry with a stable checkout.");
  }
  mkdirSync(path.dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, `${JSON.stringify({ sparkHead: head, archive: manifest["@legendapp/spark"] }, null, 2)}\n`);
} else console.log(`Spark SDK is current for ${head.slice(0, 7)}.`);

const selected = `file:${path.relative(rootDir, path.resolve(path.dirname(manifestFile), manifest["@legendapp/spark"]))}`;
if (selected !== readCache(localFile)?.sdk) {
  console.log(`Selecting local @legendapp/spark: ${selected}`);
  writeFileSync(localFile, `${JSON.stringify({ sdk: selected }, null, 2)}\n`);
}
if (flags.has("--no-run")) console.log(`SDK ready; launch with: bun run spark:sync ${appId} --skip-pull`);
else {
  const source = readFileSync(packageFile, "utf8");
  try {
    writeFileSync(packageFile, withPin(source, selected));
    run(rootDir, "bun", ["install", "--no-save"]);
  } finally {
    writeFileSync(packageFile, source);
  }
  run(rootDir, "bun", ["run", "spark", appId, "run"]);
}
