import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { installSparkWorkspace, parseSparkInstallArgs, sparkInstallHash } from "./sparkInstall";

function fixture(t: TestContext) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legend-spark-install-"));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const project = path.join(repoRoot, "project");
  const appId = "example";
  const write = (file: string, content: string | object) => {
    const location = path.join(repoRoot, file);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, typeof content === "string" ? content : JSON.stringify(content));
  };
  write("bun.lock", "root lock");
  write("apps/example/package.json", { name: "example" });
  write("apps/example/src/index.ts", "app source");
  write("packages/local/package.json", { name: "local", dependencies: { nested: "file:../nested" } });
  write("packages/local/src/index.ts", "package source");
  write("packages/nested/package.json", { name: "nested" });
  write("sdk/spark.tgz", "sdk archive");
  write("sdk/companion.tgz", "companion archive");
  write("sdk/manifest.json", { "@legendapp/spark": "spark.tgz", companion: "companion.tgz" });
  write("patches/local.patch", "patch");
  write("project/package.json", {
    dependencies: { "@legendapp/spark": "file:../sdk/spark.tgz" },
    overrides: { local: "file:../packages/local" },
    patchedDependencies: { local: "../patches/local.patch" },
  });
  const options = { project, appId, repoRoot };
  const hash = () => sparkInstallHash(project, appId, repoRoot);
  const stamp = path.join(project, "node_modules/.legend-install-stamp");
  return { repoRoot, project, write, options, hash, stamp };
}

for (const file of ["project/package.json", "bun.lock", "sdk/spark.tgz", "sdk/companion.tgz", "sdk/manifest.json", "patches/local.patch", "packages/local/package.json"]) {
  test(`install hash tracks content changes to ${file}`, t => {
    const f = fixture(t);
    const before = f.hash();
    fs.appendFileSync(path.join(f.repoRoot, file), " ");
    assert.notEqual(f.hash(), before);
  });
}

for (const directory of ["apps/example", "packages/local", "packages/nested"]) {
  test(`install hash tracks file additions and removals in ${directory}`, t => {
    const f = fixture(t);
    const before = f.hash();
    f.write(`${directory}/src/new.ts`, "new source");
    assert.notEqual(f.hash(), before);
    fs.rmSync(path.join(f.repoRoot, directory, "src/new.ts"));
    assert.equal(f.hash(), before);
  });
}

for (const owner of ["project", "packages/local"]) {
  test(`file dependencies in every section survive name collisions in ${owner}`, t => {
    const f = fixture(t);
    const pkg = JSON.parse(fs.readFileSync(path.join(f.repoRoot, owner, "package.json"), "utf8"));
    const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "overrides"];
    for (const section of sections) {
      const dependency = `packages/${section}`;
      f.write(`${dependency}/package.json`, { name: section });
      pkg[section] = { ...pkg[section], collision: `file:${path.relative(path.join(f.repoRoot, owner), path.join(f.repoRoot, dependency))}` };
    }
    f.write(`${owner}/package.json`, pkg);
    const before = f.hash();
    for (const section of sections) {
      const file = `packages/${section}/new.ts`;
      f.write(file, "new");
      assert.notEqual(f.hash(), before, section);
      fs.rmSync(path.join(f.repoRoot, file));
      assert.equal(f.hash(), before);
    }
  });
}

test("source edits, node_modules, and .git do not invalidate the file snapshot", t => {
  const f = fixture(t);
  const before = f.hash();
  f.write("packages/local/src/index.ts", "edited source");
  f.write("apps/example/src/index.ts", "edited app");
  for (const directory of ["node_modules", ".git"]) {
    f.write(`packages/local/${directory}/new.ts`, "ignored");
    f.write(`apps/example/${directory}/new.ts`, "ignored");
  }
  fs.rmSync(path.join(f.repoRoot, "packages/local/node_modules"), { recursive: true });
  fs.symlinkSync(path.join(f.repoRoot, "packages/nested"), path.join(f.repoRoot, "packages/local/node_modules"));
  assert.equal(f.hash(), before);
});

test("OS metadata files do not invalidate the file snapshot", t => {
  const f = fixture(t);
  const before = f.hash();
  for (const file of [".DS_Store", "Thumbs.db", "desktop.ini"]) {
    f.write(`apps/example/${file}`, "OS metadata");
    f.write(`packages/local/src/${file}`, "OS metadata");
  }
  assert.equal(f.hash(), before);
});

test("file snapshots are sorted independently of directory enumeration order", t => {
  const f = fixture(t);
  f.write("packages/local/src/z.ts", "z");
  f.write("packages/local/src/a.ts", "a");
  const before = f.hash();
  fs.rmSync(path.join(f.repoRoot, "packages/local/src"), { recursive: true });
  f.write("packages/local/src/a.ts", "a");
  f.write("packages/local/src/index.ts", "package source");
  f.write("packages/local/src/z.ts", "z");
  assert.equal(f.hash(), before);
});

test("install hash tracks payload additions in build and dist directories", t => {
  const f = fixture(t);
  for (const directory of ["build", ".build", "dist", ".spark", ".expo", ".gradle", "Pods", "DerivedData", "target"]) {
    for (const root of ["packages/local", "apps/example"]) {
      const before = f.hash();
      const file = `${root}/${directory}/new.js`;
      f.write(file, "payload");
      assert.notEqual(f.hash(), before, file);
      fs.rmSync(path.join(f.repoRoot, file));
      assert.equal(f.hash(), before);
    }
  }
});

test("install hash includes the Bun version", t => {
  const f = fixture(t);
  const before = f.hash();
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "bun")!;
  try {
    Object.defineProperty(process.versions, "bun", { ...descriptor, value: "different-version" });
    assert.notEqual(f.hash(), before);
  } finally {
    Object.defineProperty(process.versions, "bun", descriptor);
  }
});

test("plain install writes a stamp, skips unchanged inputs, and reinstalls changed or missing inputs", t => {
  const f = fixture(t);
  const calls: string[][] = [];
  const execute = (args: string[]) => { calls.push(args); assert.equal(fs.existsSync(f.stamp), false); };
  assert.equal(installSparkWorkspace(f.options, execute), "installed");
  assert.equal(fs.readFileSync(f.stamp, "utf8").trim(), f.hash());
  assert.equal(installSparkWorkspace(f.options, execute), "skipped");
  assert.deepEqual(calls, [["install", "--linker", "hoisted"]]);
  f.write("apps/example/src/new.ts", "new");
  assert.equal(installSparkWorkspace(f.options, execute), "installed");
  assert.equal(calls.length, 2);
  fs.rmSync(path.join(f.project, "node_modules"), { recursive: true });
  assert.equal(installSparkWorkspace(f.options, execute), "installed");
  assert.equal(calls.length, 3);
});

test("force bypasses a matching stamp and a failed install invalidates it without retrying", t => {
  const f = fixture(t);
  installSparkWorkspace(f.options, () => {});
  let attempts = 0;
  assert.equal(installSparkWorkspace({ ...f.options, force: true }, () => { attempts++; }), "installed");
  assert.equal(attempts, 1);
  assert.throws(() => installSparkWorkspace({ ...f.options, force: true }, () => {
    attempts++;
    // An installer can recreate node_modules and restore an old stamp before
    // failing. Invalidate it again while still holding the workspace lock.
    fs.writeFileSync(f.stamp, f.hash());
    throw new Error("bad patch");
  }), /bad patch/);
  assert.equal(attempts, 2);
  assert.equal(fs.existsSync(f.stamp), false);
  assert.equal(fs.existsSync(path.join(f.project, ".legend-install.lock")), false);
  assert.equal(installSparkWorkspace(f.options, () => {}), "installed");
});

test("install locks recover dead owners and empty directories", t => {
  const f = fixture(t);
  const lock = path.join(f.project, ".legend-install.lock");
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, `${child.stdout}-stale`), "");
  assert.equal(installSparkWorkspace(f.options, () => {}), "installed");
  fs.mkdirSync(lock);
  assert.equal(installSparkWorkspace({ ...f.options, offline: true }, () => { throw new Error("must skip"); }), "skipped");
  assert.equal(fs.existsSync(lock), false);
});

for (const pauseAfter of ["read", "unlink"]) {
  test(`concurrent stale-lock recoverers preserve a replacement after ${pauseAfter}`, { timeout: 30_000 }, async t => {
    const f = fixture(t);
    const lock = path.join(f.project, ".legend-install.lock");
    const dead = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, `${dead.stdout}-stale`), "");
    const ready = path.join(f.repoRoot, "ready");
    const installing = path.join(f.repoRoot, "installing");
    f.write("recoverer.ts", `import fs from "node:fs";
import { installSparkWorkspace } from ${JSON.stringify(path.resolve("scripts/lib/sparkInstall.ts"))};
const sleeper = new Int32Array(new SharedArrayBuffer(4));
function waitFor(file) {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error("barrier timed out: " + file);
    Atomics.wait(sleeper, 0, 0, 10);
  }
}
if (process.argv.includes("--delayed")) {
  if (${JSON.stringify(pauseAfter)} === "read") {
    const readdir = fs.readdirSync;
    fs.readdirSync = (...args) => {
      const entries = readdir(...args);
      if (args[0] === ${JSON.stringify(lock)} && entries.some(name => name.endsWith("-stale"))) {
        fs.writeFileSync(${JSON.stringify(ready)}, "");
        waitFor(${JSON.stringify(installing)});
      }
      return entries;
    };
  } else {
    const unlink = fs.unlinkSync;
    fs.unlinkSync = file => {
      unlink(file);
      if (file.endsWith("-stale")) {
        fs.writeFileSync(${JSON.stringify(ready)}, "");
        waitFor(${JSON.stringify(installing)});
      }
    };
  }
} else waitFor(${JSON.stringify(ready)});
installSparkWorkspace({ ...${JSON.stringify(f.options)}, force: true }, () => {
  const fd = fs.openSync(${JSON.stringify(installing)}, "wx");
  fs.closeSync(fd);
  Atomics.wait(sleeper, 0, 0, 300);
  fs.unlinkSync(${JSON.stringify(installing)});
});
`);
    const launch = (args: string[]) => {
      const child = spawn(process.execPath, [path.join(f.repoRoot, "recoverer.ts"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
      t.after(() => { child.kill(); });
      let output = "";
      child.stderr.on("data", data => { output += data; });
      return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", code => resolve({ code, output }));
      });
    };
    for (const result of await Promise.all([launch(["--delayed"]), launch([])])) {
      assert.equal(result.code, 0, result.output);
    }
    assert.equal(fs.existsSync(lock), false);
    assert.equal(fs.readFileSync(f.stamp, "utf8").trim(), f.hash());
  });
}

test("concurrent workspace installs serialize the stamp check and write", { timeout: 30_000 }, async t => {
  const f = fixture(t);
  const marker = path.join(f.repoRoot, "installing");
  const finished = path.join(f.repoRoot, "finished");
  f.write("worker.ts", `import fs from "node:fs";
import { installSparkWorkspace } from ${JSON.stringify(path.resolve("scripts/lib/sparkInstall.ts"))};
try {
console.log(installSparkWorkspace({ ...${JSON.stringify(f.options)}, offline: process.argv.includes("--offline") }, () => {
  fs.writeFileSync(${JSON.stringify(marker)}, "started");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  fs.writeFileSync(${JSON.stringify(finished)}, "finished");
}));
} catch (error) {
  if (!fs.existsSync(${JSON.stringify(finished)})) throw new Error("stamp checked before installer finished");
  throw error;
}
`);
  const launch = (args: string[]) => {
    const child = spawn(process.execPath, [path.join(f.repoRoot, "worker.ts"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => { child.kill(); });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", code => resolve({ code, output }));
    });
  };
  const first = launch([]);
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(marker), "first installer acquired the lock");
  // This source addition must be seen by the waiting stamp check, rather than
  // hashed before acquiring the lock. It therefore cannot use the old stamp.
  f.write("apps/example/src/new.ts", "new");
  const second = launch(["--offline"]);
  const [installed, refused] = await Promise.all([first, second]);
  assert.equal(installed.code, 0, installed.output);
  assert.match(installed.output, /installed/);
  assert.equal(refused.code, 1, refused.output);
  assert.match(refused.output, /dependencies changed/);
  assert.equal(fs.readFileSync(f.stamp, "utf8").trim() === f.hash(), false);
  assert.equal(fs.existsSync(path.join(f.project, ".legend-install.lock")), false);
  fs.rmSync(marker);
  const next = launch([]);
  const nextDeadline = Date.now() + 5_000;
  while (!fs.existsSync(marker) && Date.now() < nextDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(fs.existsSync(marker));
  const [one, two] = await Promise.all([next, launch(["--offline"])]);
  assert.equal(one.code, 0, one.output);
  assert.equal(two.code, 0, two.output);
  assert.match(two.output, /skipped/);
  assert.equal(fs.readFileSync(f.stamp, "utf8").trim(), f.hash());
});

for (const offline of ["flag", "env"] as const) {
  test(`${offline} offline mode skips only a matching stamp and preserves it on refusal`, t => {
    const f = fixture(t);
    const options = { ...f.options, ...parseSparkInstallArgs(offline === "flag" ? ["--offline"] : [], offline === "env" ? { LEGEND_OFFLINE: "1" } : {}) };
    const execute = () => { throw new Error("offline must never execute Bun"); };
    assert.throws(() => installSparkWorkspace(options, execute), /stamp missing.*Bun has no offline install/);
    assert.equal(fs.existsSync(f.stamp), false);
    installSparkWorkspace(f.options, () => {});
    const stamp = fs.readFileSync(f.stamp, "utf8");
    assert.equal(installSparkWorkspace(options, execute), "skipped");
    assert.throws(() => installSparkWorkspace({ ...options, force: true }, execute), /cannot reinstall offline.*LEGEND_OFFLINE=0 bun run spark example install --reinstall/);
    assert.equal(fs.readFileSync(f.stamp, "utf8"), stamp);
    assert.equal(installSparkWorkspace(options, execute), "skipped");
    f.write("apps/example/src/new.ts", "new");
    assert.throws(() => installSparkWorkspace(options, execute), /dependencies changed/);
    assert.equal(fs.readFileSync(f.stamp, "utf8"), stamp);
  });
}

test("install flags respect env and preserve flags passed to the launched app", () => {
  assert.deepEqual(parseSparkInstallArgs(["--offline", "--reinstall", "--port", "19098", "--", "--offline", "--reinstall"], {}), {
    offline: true, force: true, extra: ["--port", "19098", "--", "--offline", "--reinstall"],
  });
  assert.deepEqual(parseSparkInstallArgs([], { LEGEND_OFFLINE: "1", LEGEND_REINSTALL: "1" }), { offline: true, force: false, extra: [] });
  assert.deepEqual(parseSparkInstallArgs(["--", "--offline"], { LEGEND_OFFLINE: "0" }), { offline: false, force: false, extra: ["--", "--offline"] });
  assert.deepEqual(parseSparkInstallArgs(["--offline", "slides", "run", "--reinstall", "--", "--offline"], {}), {
    offline: true, force: true, extra: ["slides", "run", "--", "--offline"],
  });
});

function cliFixture(t: TestContext, appIds = ["example"]) {
  const f = fixture(t);
  f.write("scripts/lib/apps.ts", `export const rootDir = ${JSON.stringify(f.repoRoot)};
export const appIds = ${JSON.stringify(appIds)};
export async function loadAppManifest(id) { return { id, platforms: id === "unsupported" ? ["ios"] : ["macos"] }; }
export function assertSupportedPlatform() {}
`);
  f.write("scripts/lib/sparkWorkspaces.ts", `import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./apps";
export function prepareSparkWorkspace(manifest) {
  fs.appendFileSync(path.join(rootDir, "prepared"), manifest.id + "\\n");
  return path.join(rootDir, manifest.id);
}
`);
  for (const file of ["spark-app.ts", "spark-warm.ts", "lib/sparkInstall.ts"]) {
    f.write(`scripts/${file}`, fs.readFileSync(path.resolve("scripts", file), "utf8"));
  }
  f.write("bin/bun", `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
fs.appendFileSync(${JSON.stringify(path.join(f.repoRoot, "attempts"))}, JSON.stringify([path.basename(process.cwd()), process.argv.slice(2)]) + "\\n");
process.exit(fs.existsSync(${JSON.stringify(path.join(f.repoRoot, "fail"))}) ? 23 : 0);
`);
  fs.chmodSync(path.join(f.repoRoot, "bin/bun"), 0o755);
  for (const id of appIds) {
    f.write(`${id}/package.json`, { dependencies: { "@legendapp/spark": "0.0.1" } });
    f.write(`apps/${id}/package.json`, { name: id });
  }
  const env = { ...process.env, PATH: `${path.join(f.repoRoot, "bin")}:${process.env.PATH}`, LEGEND_OFFLINE: "0", EXPO_OFFLINE: "0" };
  const invoke = (script: string, args: string[], offlineEnv = false) => spawnSync(process.execPath, [path.join(f.repoRoot, `scripts/${script}.ts`), ...args], {
    env: { ...env, LEGEND_OFFLINE: offlineEnv ? "1" : "0" }, encoding: "utf8", timeout: 30_000,
  });
  const attempts = () => fs.existsSync(path.join(f.repoRoot, "attempts"))
    ? fs.readFileSync(path.join(f.repoRoot, "attempts"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  return { ...f, invoke, attempts };
}

function nativeFixture(f: ReturnType<typeof cliFixture>) {
  const sdk = "example/node_modules/@legendapp/spark";
  const dist = `${sdk}/vendor/node_modules/@legendapp/spark-cli/dist`;
  f.write(`${sdk}/package.json`, { name: "@legendapp/spark", exports: { "./cli": "./bin/spark.cjs" } });
  f.write(`${sdk}/bin/spark.cjs`, "");
  // Stub graph discovery; use Spark's real framework-file checks below.
  f.write(`${dist}/project.js`, `import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
export const digest = value => createHash("sha256").update(value).digest("hex");
export const stateFile = (root, name) => path.join(root, ".spark", name);
export const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
export function prepareConfig() {}
export const nativePackages = () => [];
export const incompatible = runtime => runtime.incompatible ? ["changed native package"] : [];
export const nativePreparationInputs = root => readJson(path.join(root, "inputs.json"));
export const nativeProjectFingerprint = inputs => digest(JSON.stringify(inputs.config));
export const runtimeFor = root => ({ fingerprint: fs.readFileSync(path.join(root, "runtime"), "utf8") });
export const hashFiles = () => "bundle";
`);
  f.write(`${dist}/native-preparation.js`, fs.readFileSync("node_modules/@legendapp/spark/vendor/node_modules/@legendapp/spark-cli/dist/native-preparation.js", "utf8"));
  for (const file of ["cli-arguments.js", "build-mode.js"]) {
    f.write(`${dist}/${file}`, fs.readFileSync(`node_modules/@legendapp/spark/vendor/node_modules/@legendapp/spark-cli/dist/${file}`, "utf8"));
  }
  f.write(`${dist}/local.js`, `import fs from "node:fs";
export const findGo = () => fs.existsSync(${JSON.stringify(path.join(f.repoRoot, "runner.json"))})
  ? JSON.parse(fs.readFileSync(${JSON.stringify(path.join(f.repoRoot, "runner.json"))}, "utf8")) : undefined;
`);
  f.write(`${dist}/build.js`, `export async function analyze() {
  if (process.env.EXPO_OFFLINE !== "1") throw new Error("analysis must be offline");
  return { included: [] };
}
`);
  f.write("example/inputs.json", { config: {}, packages: [], plugin: "host" });
  f.write("example/runtime", "runtime");
  f.write("example/.spark/settings.json", { target: "dev" });
  const inputs = fs.readFileSync(path.join(f.repoRoot, "example/inputs.json"), "utf8");
  const fingerprint = createHash("sha256").update(inputs).digest("hex");
  const projectFingerprint = createHash("sha256").update("{}").digest("hex");
  f.write("example/.spark/native-preparation.json", { fingerprint, projectFingerprint });
  f.write("example/macos/Example.xcodeproj/project.pbxproj", "project");
  f.write("example/macos/Podfile.lock", "pods");
  f.write("example/macos/Pods/Manifest.lock", "pods");
  fs.mkdirSync(path.join(f.repoRoot, "example/macos/Pods/Target Support Files"), { recursive: true });
  return { fingerprint, projectFingerprint };
}

test("warm continues after failure, retains Bun status, and preserves stamps offline", { timeout: 30_000 }, t => {
  const f = cliFixture(t, ["example", "unsupported", "last"]);
  f.write("fail", "");
  const failed = f.invoke("spark-warm", []);
  assert.equal(failed.status, 23, failed.stderr);
  assert.match(failed.stderr, /Bun install failed.*23/);
  assert.doesNotMatch(failed.stderr, /at .*sparkInstall|cache|retry/);
  assert.equal(fs.readFileSync(path.join(f.repoRoot, "prepared"), "utf8"), "example\nlast\n");
  assert.deepEqual(f.attempts(), [
    ["example", ["install", "--linker", "hoisted"]],
    ["last", ["install", "--linker", "hoisted"]],
  ]);
  fs.rmSync(path.join(f.repoRoot, "fail"));
  assert.equal(f.invoke("spark-warm", []).status, 0);
  const before = f.attempts();
  for (const offlineEnv of [false, true]) {
    const args = offlineEnv ? [] : ["--offline"];
    const skipped = f.invoke("spark-warm", args, offlineEnv);
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.match(skipped.stdout, /last: dependencies unchanged; skipping/);
    const refused = f.invoke("spark-warm", [...args, "--reinstall"], offlineEnv);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /cannot reinstall offline/);
    assert.equal(f.invoke("spark-warm", args, offlineEnv).status, 0);
    assert.deepEqual(f.attempts(), before);
  }
});

function appFixture(t: TestContext) {
  const f = cliFixture(t);
  f.write("scripts/lib/run.ts", `import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./apps";
export function getDevSyntaxAssetSourceRoot() { return "syntax"; }
export function getSlidesCompilerPath() { return "compiler"; }
export function runCommand(command, args, options) {
  if (command === "node" && args.includes("build") && args.includes("--dev")) {
    fs.writeFileSync(path.join(options.cwd, ".spark/settings.json"), JSON.stringify({ target: "dev" }));
  }
  fs.appendFileSync(path.join(rootDir, "commands"), JSON.stringify({ command, args, ...options }) + "\\n");
}
`);
  f.write("scripts/lib/sparkDevServer.ts", `import { runCommand } from "./run";
export async function runSparkDevServer(options) { runCommand("dev", options.runnerArgs, options); }
`);
  const { fingerprint, projectFingerprint } = nativeFixture(f);
  const app = (action: string, args: string[] = [], offlineEnv = false) => f.invoke("spark-app", ["example", action, ...args], offlineEnv);
  const stamp = path.join(f.repoRoot, "example/node_modules/.legend-install-stamp");
  const commands = () => fs.existsSync(path.join(f.repoRoot, "commands"))
    ? fs.readFileSync(path.join(f.repoRoot, "commands"), "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  return { ...f, fingerprint, projectFingerprint, app, stamp, commands };
}

test("spark-app wires installs and reports Bun failures cleanly", { timeout: 30_000 }, t => {
  const f = appFixture(t);
  const { app, stamp, commands } = f;
  for (const action of ["prepare", "analyze"]) {
    const result = app(action);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.attempts().length, 0);
  }
  for (const action of ["install", "build", "build-release", "run", "start"]) {
    const before = f.attempts().length;
    const result = app(action, ["--reinstall", "--port", "19098"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(f.attempts().length, before + 1, action);
  }
  assert.ok(commands().every(call => !call.args.includes("--reinstall")));
  f.write("fail", "");
  const failed = app("start", ["--reinstall"]);
  assert.equal(failed.status, 23, failed.stderr);
  assert.match(failed.stderr, /Bun install failed.*23/);
  assert.doesNotMatch(failed.stderr, /at .*sparkInstall|cache|retry/);
  assert.equal(fs.existsSync(stamp), false);
});

test("spark-app forwards only the analyze action tail to the CLI and offline guard", { timeout: 30_000 }, t => {
  const f = appFixture(t);
  const offlineArgsFile = path.join(f.repoRoot, "offline-args.json");
  f.write("scripts/lib/sparkInstall.ts", fs.readFileSync(path.join(f.repoRoot, "scripts/lib/sparkInstall.ts"), "utf8").replace(
    "export function assertSparkOfflineArgs(args: string[]) {",
    `export function assertSparkOfflineArgs(args: string[]) {
  fs.writeFileSync(${JSON.stringify(offlineArgsFile)}, JSON.stringify(args));`,
  ));
  const cli = fs.realpathSync(path.join(f.repoRoot, "example/node_modules/@legendapp/spark/bin/spark.cjs"));
  for (const tail of [[], ["--help"], ["--help", "--", "--offline", "--reinstall"]]) {
    for (const mode of ["online", "flag", "env"]) {
      const result = mode === "flag"
        ? f.invoke("spark-app", ["--offline", "example", "analyze", ...tail])
        : f.app("analyze", tail, mode === "env");
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(f.commands().at(-1).args, [cli, "analyze", ...tail]);
      if (mode !== "online") {
        assert.deepEqual(JSON.parse(fs.readFileSync(offlineArgsFile, "utf8")), tail);
      }
    }
  }
  assert.deepEqual(f.attempts(), []);
});

for (const offlineEnv of [false, true]) {
  test(`spark-app enforces offline downstream via ${offlineEnv ? "env" : "flag"}`, { timeout: 30_000 }, t => {
    const f = appFixture(t);
    const { fingerprint, projectFingerprint, app, stamp, commands } = f;
    assert.equal(app("install").status, 0);
    const args = offlineEnv ? [] : ["--offline"];
    const originalStamp = fs.readFileSync(stamp, "utf8");
    const before = f.attempts().length;
    const started = app("start", [...args, "--port", "19098"], offlineEnv);
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /dependencies unchanged; skipping/);
    const dev = commands().at(-1);
    assert.equal(dev.command, "dev");
    assert.equal(dev.env.EXPO_OFFLINE, "1");
    assert.equal(dev.env.LEGEND_OFFLINE, "1");
    assert.deepEqual(dev.args, ["--port", "19098"]);
    for (const action of ["build", "build-release", "run"]) {
      const built = app(action, args, offlineEnv);
      assert.equal(built.status, 0, built.stderr);
      const calls = commands().slice(action === "run" ? -2 : -1);
      assert.ok(calls.every(call => call.env.EXPO_OFFLINE === "1"));
      assert.deepEqual(calls[0].args.slice(1), ["build", action === "build-release" ? "--release" : "--dev"]);
    }
    const count = commands().length;
    fs.rmSync(path.join(f.repoRoot, "example/macos/Pods/Manifest.lock"));
    for (const action of ["build", "build-release", "run"]) {
      const refused = app(action, args, offlineEnv);
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /needs pod install.*Manifest.lock missing/);
      assert.match(refused.stderr, /supervisor keys \(b\/g\/d\).*outside/);
    }
    assert.equal(commands().length, count);
    const help = app("build", [...args, "--help"], offlineEnv);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /supervisor keys \(b\/g\/d\)/);
    f.write("example/macos/Pods/Manifest.lock", "pods");
    for (const [file, value, reason] of [
      ["example/.spark/native-preparation.json", { fingerprint: "stale", projectFingerprint: "stale" }, "native project needs generation"],
      ["example/.spark/native-preparation.json", { fingerprint: "stale", projectFingerprint }, "native preparation is missing or out of date"],
      ["example/macos/Pods/Target Support Files/Example/Example-xcframeworks.sh", 'install_xcframework "${PODS_ROOT}/Missing.xcframework" "Missing" "framework" "macos-arm64"', "native frameworks missing"],
    ] as const) {
      const previous = fs.existsSync(path.join(f.repoRoot, file)) ? fs.readFileSync(path.join(f.repoRoot, file)) : undefined;
      f.write(file, value);
      const refused = app("build", args, offlineEnv);
      assert.equal(refused.status, 1, refused.stdout);
      assert.ok(refused.stderr.includes(reason), refused.stderr);
      if (previous) fs.writeFileSync(path.join(f.repoRoot, file), previous);
      else fs.rmSync(path.join(f.repoRoot, file));
    }
    const forced = app("build", [...args, "--force"], offlineEnv);
    assert.equal(forced.status, 1);
    assert.match(forced.stderr, /native project needs generation/);
    f.write("alternate/inputs.json", { config: {}, packages: [], plugin: "host" });
    f.write("alternate/runtime", "runtime");
    const redirected = app("build", [...args, "--project", "../alternate"], offlineEnv);
    assert.equal(redirected.status, 1);
    assert.match(redirected.stderr, /Offline mode does not support --project redirects/);
    assert.equal(commands().length, count + 1);
    // Spark reuses a cached app before checking missing Pods/frameworks.
    f.write("example/.spark/dev-build.json", { runtime: { fingerprint: "runtime" }, preparation: { fingerprint }, app: path.join(f.repoRoot, "example/runtime") });
    fs.rmSync(path.join(f.repoRoot, "example/macos/Pods/Manifest.lock"));
    const cached = app("build", args, offlineEnv);
    assert.equal(cached.status, 0, cached.stderr);
    fs.rmSync(path.join(f.repoRoot, "example/.spark/dev-build.json"));
    f.write("example/macos/Pods/Manifest.lock", "pods");
    const afterBuilds = commands().length;
    assert.equal(app("install", [...args, "--reinstall"], offlineEnv).status, 1);
    assert.equal(fs.readFileSync(stamp, "utf8"), originalStamp);
    assert.equal(app("install", args, offlineEnv).status, 0);
    fs.rmSync(stamp);
    const missing = app("start", args, offlineEnv);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /stamp missing.*Bun has no offline install/);
    assert.equal(commands().length, afterBuilds);
    assert.equal(f.attempts().length, before);
    assert.equal(app("install").status, 0);
  });
}

for (const offlineEnv of [false, true]) {
  test(`offline project redirects reject missing and stale stamps via ${offlineEnv ? "env" : "flag"}`, { timeout: 30_000 }, t => {
    const f = appFixture(t);
    const { app, commands } = f;
    assert.equal(app("install").status, 0);
    const args = offlineEnv ? [] : ["--offline"];
    // The original workspace is warmed; redirected workspaces may have either
    // no stamp or a stale stamp. Reject both forms before any SDK command runs.
    for (const redirectedStamp of [undefined, "stale"]) {
      if (redirectedStamp) f.write("alternate/node_modules/.legend-install-stamp", redirectedStamp);
      else fs.rmSync(path.join(f.repoRoot, "alternate/node_modules/.legend-install-stamp"), { force: true });
      for (const action of ["build", "build-release", "run", "start", "analyze"]) {
        for (const redirect of [["--project", "../alternate"], ["--project=../alternate"]]) {
          const refused = app(action, [...args, ...redirect], offlineEnv);
          assert.equal(refused.status, 1);
          assert.match(refused.stderr, /Offline mode does not support --project redirects/);
        }
      }
    }
    const afterSeparator = app("start", [...args, "--", "--project=../alternate"], offlineEnv);
    assert.equal(afterSeparator.status, 1);
    assert.match(afterSeparator.stderr, /Offline mode does not support --project redirects/);
    assert.equal(commands().length, 0);
    assert.equal(f.attempts().length, 1);
  });
}

for (const offlineEnv of [false, true]) {
  test(`offline run checks the dev target after building via ${offlineEnv ? "env" : "flag"}`, { timeout: 30_000 }, t => {
    const f = appFixture(t);
    const { app, commands } = f;
    assert.equal(app("install").status, 0);
    const args = offlineEnv ? [] : ["--offline"];
    for (const settings of [undefined, { target: "go" }, { target: "go", goApp: "saved-runner" }]) {
      const settingsFile = path.join(f.repoRoot, "example/.spark/settings.json");
      if (settings) f.write("example/.spark/settings.json", settings);
      else fs.rmSync(settingsFile);
      const built = app("run", args, offlineEnv);
      assert.equal(built.status, 0, built.stderr);
      assert.deepEqual(JSON.parse(fs.readFileSync(settingsFile, "utf8")), { target: "dev" });
      const calls = commands().slice(-2);
      assert.deepEqual(calls[0].args.slice(1), ["build", "--dev"]);
      assert.equal(calls[1].command, "dev");
    }
    const prefixedFlags = f.invoke("spark-app", ["--offline", "example", "run"]);
    assert.equal(prefixedFlags.status, 0, prefixedFlags.stderr);
    for (const startup of [["--no-open"], ["--runner-binary", "local-runner"], ["--runner-binary=local-runner"]]) {
      const allowed = app("run", [...args, ...startup], offlineEnv);
      assert.equal(allowed.status, 0, allowed.stderr);
    }
    const noOpen = app("start", args, offlineEnv);
    assert.equal(noOpen.status, 0, noOpen.stderr);
    f.write("runner.json", { runtime: {} });
    const localRunner = app("run", args, offlineEnv);
    assert.equal(localRunner.status, 0, localRunner.stderr);
    fs.rmSync(path.join(f.repoRoot, "runner.json"));
    f.write("example/.spark/settings.json", { target: "dev" });
    const appFlags = app("run", [...args, "--", "--project=../alternate", "--runner-binary=app-value"], offlineEnv);
    assert.equal(appFlags.status, 0, appFlags.stderr);
    assert.equal(f.attempts().length, 1);
  });
}
