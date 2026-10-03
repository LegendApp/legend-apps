import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

function fixture(customSpark = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-sync-"));
  temporary.push(root);
  const log = path.join(root, "operations");
  const git = (repo: string, ...args: string[]) => {
    const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const devApps = path.join(root, "dev-apps");
  const devSpark = path.join(root, "dev-spark");
  const apps = path.join(root, "legend-apps");
  const spark = path.join(root, customSpark ? "custom-sdk" : "legend-spark");
  const commit = (repo: string) => { git(repo, "add", "."); git(repo, "commit", "-qm", "fixture update"); };
  for (const repo of [devApps, devSpark, apps, spark]) {
    fs.mkdirSync(repo);
    git(repo, "init", "-q", "-b", "main");
    git(repo, "config", "user.name", "Sync Test");
    git(repo, "config", "user.email", "sync@example.invalid");
  }
  write(path.join(devApps, "scripts/sync-spark-sdk.ts"), fs.readFileSync(path.join(import.meta.dirname, "sync-spark-sdk.ts"), "utf8"));
  write(path.join(devApps, "package.json"), JSON.stringify({ name: "apps", version: "1", catalog: { "@legendapp/spark": "file:initial.tgz" } }, null, 2) + "\n");
  write(path.join(devSpark, "source.txt"), "first");
  write(path.join(devSpark, ".gitignore"), ".spark/\nartifacts/\nnode_modules/\n");
  for (const [repo, dev] of [[apps, devApps], [spark, devSpark]]) {
    commit(dev);
    git(repo, "remote", "add", "dev", dev);
    git(repo, "fetch", "-q", "dev");
    git(repo, "reset", "--hard", "dev/main");
  }
  const bin = path.join(root, "bin");
  const executable = (name: string, source: string) => {
    const file = path.join(bin, name);
    write(file, `#!/usr/bin/env node\n${source}`);
    fs.chmodSync(file, 0o755);
  };
  executable("npm", `
const fs = require("node:fs");
const args = process.argv.slice(2).join(" ");
fs.appendFileSync(process.env.SDK_SYNC_TEST_LOG, "npm " + args + "\\n");
if (args === "ci") process.exit(0);
if (args !== "run pack:local") process.exit(2);
if (process.env.PACK_FAIL === "1") process.exit(1);
fs.mkdirSync("artifacts/packages", { recursive: true });
const archive = "spark-" + fs.readFileSync("source.txt", "utf8") + ".tgz";
fs.writeFileSync("artifacts/packages/" + archive, "sdk");
fs.writeFileSync("artifacts/packages/companion.tgz", "companion");
fs.writeFileSync("artifacts/packages/manifest.json", JSON.stringify({ "@legendapp/spark": archive, companion: "companion.tgz" }));
`);
  executable("bun", `
const fs = require("node:fs");
const args = process.argv.slice(2).join(" ");
const pin = JSON.parse(fs.readFileSync("package.json", "utf8")).catalog["@legendapp/spark"];
if (args === "install --no-save") fs.writeFileSync(process.env.SDK_SYNC_TEST_LOG + ".installed", pin);
else if (fs.readFileSync(process.env.SDK_SYNC_TEST_LOG + ".installed", "utf8") !== pin) process.exit(2);
fs.appendFileSync(process.env.SDK_SYNC_TEST_LOG, "bun " + args + "\\n");
`);
  const run = (args: string[] = [], extraEnv: Record<string, string> = {}) => spawnSync(process.execPath, [path.join(apps, "scripts/sync-spark-sdk.ts"), ...args], {
    cwd: apps, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LEGEND_SPARK_ROOT: spark, LEGEND_SYNC_REMOTE: "dev", SDK_SYNC_TEST_LOG: log, ...extraEnv },
  });
  const ok = (args: string[] = []) => { const result = run(args); assert.equal(result.status, 0, result.stderr + result.stdout); return result; };
  const operations = () => fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
  const pin = () => JSON.parse(fs.readFileSync(path.join(apps, "package.json"), "utf8")).catalog["@legendapp/spark"];
  return { root, apps, spark, devApps, devSpark, git, write, commit, run, ok, operations, pin };
}

test("pulls dev, installs the selected SDK before launch, and carries a local pin across later updates", () => {
  const f = fixture(true);
  f.ok();
  assert.deepEqual(f.operations(), ["npm ci", "npm run pack:local", "bun install --no-save", "bun run spark slides run"]);
  assert.equal(f.pin(), "file:../custom-sdk/artifacts/packages/spark-first.tgz");
  f.ok(["--no-run", "diff"]);
  assert.equal((f.operations()).length, 4);
  f.write(path.join(f.devSpark, "source.txt"), "second");
  f.commit(f.devSpark);
  const updated = JSON.parse(fs.readFileSync(path.join(f.devApps, "package.json"), "utf8"));
  updated.version = "2";
  updated.catalog["@legendapp/spark"] = "file:remote-second.tgz";
  f.write(path.join(f.devApps, "package.json"), JSON.stringify(updated, null, 2) + "\n");
  f.commit(f.devApps);
  f.ok(["diff"]);
  assert.equal(f.git(f.spark, "rev-parse", "HEAD"), f.git(f.devSpark, "rev-parse", "HEAD"));
  assert.equal(f.git(f.apps, "rev-parse", "HEAD"), f.git(f.devApps, "rev-parse", "HEAD"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.apps, "package.json"), "utf8")).version, "2");
  assert.ok((f.pin()).endsWith("spark-second.tgz"));
  assert.deepEqual(f.operations().slice(-4), ["npm ci", "npm run pack:local", "bun install --no-save", "bun run spark diff run"]);
});

test("retries a failed pack even when the previous attempt already pulled Spark", () => {
  const f = fixture();
  f.ok(["--no-run"]);
  const originalPin = f.pin();
  f.write(path.join(f.devSpark, "source.txt"), "second");
  f.commit(f.devSpark);
  assert.notEqual(f.run([], { PACK_FAIL: "1" }).status, 0);
  assert.equal(f.pin(), originalPin);
  assert.deepEqual(f.operations().filter(line => line.startsWith("bun ")), []);
  f.ok();
  assert.ok((f.pin()).endsWith("spark-second.tgz"));
  assert.equal((f.operations().filter(line => line === "npm run pack:local")).length, 3);
});

test("rebuilds missing companion archives and corrupt markers", () => {
  const f = fixture();
  f.ok(["--no-run"]);
  fs.unlinkSync(path.join(f.spark, "artifacts/packages/companion.tgz"));
  f.ok(["--skip-pull", "--no-run"]);
  f.write(path.join(f.spark, ".spark/sync-sdk.json"), "{");
  f.ok(["--skip-pull", "--no-run"]);
  assert.equal((f.operations().filter(line => line === "npm run pack:local")).length, 3);
});

test("preserves a local pin when a divergent apps branch prevents pulling", () => {
  const f = fixture();
  f.ok(["--no-run"]);
  const pin = f.pin();
  f.git(f.apps, "commit", "--allow-empty", "-qm", "local");
  f.git(f.devApps, "commit", "--allow-empty", "-qm", "remote");
  const head = f.git(f.apps, "rev-parse", "HEAD");
  assert.notEqual(f.run().status, 0);
  assert.equal(f.pin(), pin);
  assert.equal(f.git(f.apps, "rev-parse", "HEAD"), head);
  assert.deepEqual(f.operations(), ["npm ci", "npm run pack:local"]);
});

test("rejects uncommitted Spark sources and unrelated catalog edits without discarding them", () => {
  const f = fixture();
  f.write(path.join(f.spark, "source.txt"), "dirty");
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(path.join(f.spark, "source.txt"), "utf8"), "dirty");
  assert.deepEqual(f.operations(), []);
  f.git(f.spark, "restore", "source.txt");
  f.ok(["--no-run"]);
  const file = path.join(f.apps, "package.json");
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.version = "local";
  f.write(file, JSON.stringify(value, null, 2) + "\n");
  const source = fs.readFileSync(file, "utf8");
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(file, "utf8"), source);
});
