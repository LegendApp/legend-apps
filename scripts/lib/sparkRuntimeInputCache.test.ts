import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
const rootDir = path.resolve(import.meta.dirname, "../..");

const sdk = fs.realpathSync(path.join(rootDir, "node_modules/@legendapp/spark"));
const cli = path.join(sdk, "vendor/node_modules/@legendapp/spark-cli/dist");
const require = createRequire(path.join(cli, "project.js"));
const { transformSync } = require("esbuild");
const patchFile = path.join(rootDir, "patches/@legendapp+spark@0.0.2.patch");
const patch = fs.readFileSync(patchFile, "utf8");
const helperPath = "vendor/node_modules/@legendapp/spark-cli/dist/runtime-input-cache.js";
const source = patch.split(`+++ b/${helperPath}\n`)[1]!.split("\n")
  .filter(line => line.startsWith("+")).map(line => line.slice(1)).join("\n") + "\n";
const code = transformSync(source, { format: "cjs", loader: "js" }).code;
const wait = () => new Promise(resolve => setTimeout(resolve, 200));

function evaluate(code: string, modules: Record<string, unknown>) {
  const module = { exports: {} as Record<string, any> };
  Function("require", "module", "exports", code)((name: string) => modules[name] ?? require(name), module, module.exports);
  return module.exports;
}

function fixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "spark-input-cache-")));
  const root = path.join(base, "app"), native = path.join(base, "workspace/native"), plain = path.join(base, "workspace/plain");
  for (const directory of [root, native, plain, path.join(root, ".spark/platforms/macos"), path.join(native, "macos"), path.join(root, "node_modules")]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  for (const directory of [root, native, plain]) fs.writeFileSync(path.join(directory, "package.json"), '{"version":"1"}');
  fs.writeFileSync(path.join(root, "desktop.config.json"), "{}");
  fs.writeFileSync(path.join(native, "macos/one.mm"), "one");
  let calls = 0, graphs = 0, opened = 0, failWatch = false, expo = false;
  const argumentsSeen: string[] = [];
  const watchers = new Set<fs.FSWatcher>();
  let graph = () => [native, plain].map(root => ({ root, json: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) }));
  const project = {
    installedPackages(root: string) { argumentsSeen.push(root); graphs++; return graph(); },
    nativePackages(root: string) { argumentsSeen.push(root); calls++; return [{ signature: calls }]; },
    isExpoProject: () => expo,
  };
  const load = (projectRoot = root) => evaluate(code, {
    "./project.js": project,
    "@legendapp/spark-desktop-config/config.cjs": project,
    "node:fs": { ...fs, watch(location: string, options: fs.WatchOptions, callback: fs.WatchListener<string>) {
      if (failWatch) throw new Error("watch unavailable");
      // Global resolution directories are not part of this isolated fixture.
      if (!location.startsWith(base + path.sep)) return { on() {}, close() {} };
      const watcher = fs.watch(location, options, callback);
      watchers.add(watcher); opened++;
      const close = watcher.close.bind(watcher);
      watcher.close = () => { watchers.delete(watcher); return close(); };
      return watcher;
    } },
  }).createRuntimeInputCache(projectRoot);
  return { base, root, native, plain, watchers, load, argumentsSeen, opened: () => opened, calls: () => calls, graphs: () => graphs,
    setGraph(next: typeof graph) { graph = next; }, getGraph: () => graph,
    failWatch(value: boolean) { failWatch = value; }, expo(value: boolean) { expo = value; },
    remove() { for (const watcher of watchers) watcher.close(); fs.rmSync(base, { recursive: true, force: true }); } };
}

test("the SDK patch applies exactly to the installed CLI and closes cache ownership on startup failure", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "spark-cache-patch-"));
  const devPath = "vendor/node_modules/@legendapp/spark-cli/dist/dev.js";
  try {
    fs.mkdirSync(path.dirname(path.join(temporary, devPath)), { recursive: true });
    fs.copyFileSync(path.join(sdk, devPath), path.join(temporary, devPath));
    if (fs.existsSync(path.join(sdk, helperPath))) {
      fs.copyFileSync(path.join(sdk, helperPath), path.join(temporary, helperPath));
      const reverse = spawnSync("git", ["apply", "--reverse", patchFile], { cwd: temporary, encoding: "utf8" });
      assert.equal(reverse.status, 0, reverse.stderr);
    }
    for (const args of [["apply", "--check", patchFile], ["apply", patchFile]]) {
      const result = spawnSync("git", args, { cwd: temporary, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(path.join(temporary, helperPath), "utf8"), source);
    const devFile = path.join(temporary, devPath);
    const patched = fs.readFileSync(devFile, "utf8");
    const compiled = transformSync(patched, { format: "cjs", loader: "js", define: {
      "import.meta.url": JSON.stringify(pathToFileURL(devFile).href), "import.meta.dirname": JSON.stringify(path.dirname(devFile)),
    } }).code;
    let closed = 0, directoryClosed = 0;
    const { dev } = evaluate(compiled, {
      "./runtime-input-cache.js": { createRuntimeInputCache: () => ({ read: () => ({ native: [] }), close: () => closed++ }) },
      "./native-patch-preflight.js": { assertNativePatchPreflight() {} },
      "./platform.js": { projectPlatform: () => "macos" },
      "./project.js": { dependencyStamp: () => "unchanged", stateFile: (_root: string, name: string) => path.join(temporary, name),
        prepareConfig() { throw new Error("startup stopped"); }, writeJson() {}, readJson: () => ({}), readAppConfig: () => ({}), incompatible: () => [], goConfigurationIssues: () => [] },
      "./local.js": { registerRuntime() {}, readRuntime: () => ({ mode: "go" }) },
      "./release.js": { installedRelease() {} },
      "./runner-install.js": {}, "./process.js": {}, "./build.js": {}, "./watchman.js": {},
      "./session-status.js": { sessionStatus: () => ({ compatible: true, message: "", canBuild: true }) },
      "./commands.js": { cancelCommands() {} },
      "./windows-metro.js": { stopWindowsMetro() {} },
      "node:module": { createRequire: () => () => ({ preparePatch() {} }) },
      "node:fs": { existsSync: () => false, rmSync() {}, watch: () => ({ close: () => directoryClosed++ }) },
    });
    const signals = process.listenerCount("SIGINT");
    await assert.rejects(dev(temporary, "/runner.app", [], true), /startup stopped/);
    assert.equal(closed, 1);
    assert.equal(directoryClosed, 1);
    assert.equal(process.listenerCount("SIGINT"), signals);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("unchanged polls reuse native inputs and lazily computed development fingerprints", async () => {
  const f = fixture(), cache = f.load();
  try {
    cache.read(); await wait();
    const first = cache.read(), opened = f.opened();
    await wait();
    first.development = { fingerprint: "one" };
    for (let i = 0; i < 60; i++) assert.equal(cache.read(), first);
    assert.equal(f.calls(), 2);
    assert.equal(f.graphs(), 4);
    assert.equal(f.opened(), opened);
    assert.equal(cache.read().development.fingerprint, "one");
    cache.invalidate();
    const refreshed = cache.read();
    assert.notEqual(refreshed, first);
    assert.equal(refreshed.development, undefined);
    assert.equal(f.calls(), 3);
  } finally { cache.close(); assert.equal(f.watchers.size, 0); f.remove(); }
});

test("native edits, new modules, configuration and resolution changes invalidate the cache", async () => {
  const f = fixture(), cache = f.load();
  try {
    cache.read();
    for (const [label, operation] of [
      ["native edit", () => fs.writeFileSync(path.join(f.native, "macos/one.mm"), "two")],
      ["native add", () => fs.writeFileSync(path.join(f.native, "macos/two.mm"), "two")],
      ["native remove", () => fs.unlinkSync(path.join(f.native, "macos/two.mm"))],
      ["new native marker", () => fs.writeFileSync(path.join(f.plain, "Module.podspec"), "spec")],
      ["package manifest", () => fs.writeFileSync(path.join(f.plain, "package.json"), '{"version":"2"}')],
      ["dependencies", () => fs.writeFileSync(path.join(f.root, "package.json"), '{"dependencies":{"new":"1"}}')],
      ["host config", () => fs.writeFileSync(path.join(f.root, "desktop.config.json"), '{"window":{}}')],
      ["signing config", () => fs.writeFileSync(path.join(f.root, ".spark/settings.json"), '{"identity":"a"}')],
      ["new resolution directory", () => fs.mkdirSync(path.join(f.native, "node_modules"))],
      ["new dependency link", () => fs.symlinkSync(f.native, path.join(f.root, "node_modules/linked"))],
      ["dependency link replacement", () => { fs.unlinkSync(path.join(f.root, "node_modules/linked")); fs.symlinkSync(f.plain, path.join(f.root, "node_modules/linked")); }],
      ["package root replacement", () => { fs.renameSync(f.plain, f.plain + "-old"); fs.mkdirSync(f.plain); fs.writeFileSync(path.join(f.plain, "package.json"), '{"version":"3"}'); fs.writeFileSync(path.join(f.plain, "one.mm"), "one"); }],
      ["edit replaced package source", () => fs.writeFileSync(path.join(f.plain, "one.mm"), "two")],
    ] as const) {
      const before = f.calls();
      operation();
      const deadline = Date.now() + 2000;
      do { await wait(); cache.read(); } while (f.calls() === before && Date.now() < deadline);
      assert.equal(f.calls(), before + 1, label);
      if (label === "package root replacement") { await wait(); cache.read(); await wait(); }
    }
    await wait(); cache.read();
    for (const directory of [path.join(f.root, ".spark"), path.join(f.root, ".spark/platforms/macos")]) {
      const before = f.calls(), temporary = path.join(directory, `session.json.${process.pid}.tmp`);
      fs.writeFileSync(temporary, "{}"); fs.renameSync(temporary, path.join(directory, "session.json"));
      await wait(); cache.read();
      assert.equal(f.calls(), before, "status output is not an input");
    }
  } finally { cache.close(); assert.equal(f.watchers.size, 0); f.remove(); }
});

test("concurrent graph changes stay dirty and watcher failures retain uncached polling", async () => {
  const f = fixture();
  let cache = f.load();
  try {
    const added = path.join(f.base, "added"); fs.mkdirSync(added); fs.writeFileSync(path.join(added, "package.json"), "{}");
    const original = f.getGraph(); let graphPass = 0;
    f.setGraph(() => [...original(), ...(graphPass++ ? [{ root: added, json: {} }] : [])]);
    cache.read(); cache.read();
    assert.equal(f.calls(), 2, "a graph change during fill must be checked again");
    await wait(); cache.read(); await wait();
    const before = f.calls(); cache.read(); assert.equal(f.calls(), before);
    f.watchers.values().next().value!.emit("error", new Error("watch failed"));
    cache.read(); cache.read();
    assert.equal(f.calls(), before + 2); assert.equal(f.watchers.size, 0);
    cache.close(); f.failWatch(true); cache = f.load();
    const unsupported = f.calls(); cache.read(); cache.read();
    assert.equal(f.calls(), unsupported + 2); assert.equal(f.watchers.size, 0);
    cache.close(); f.failWatch(false); f.expo(true); cache = f.load();
    const dynamic = f.calls(); cache.read(); cache.read();
    assert.equal(f.calls(), dynamic + 2); assert.equal(f.watchers.size, 0);
  } finally { cache.close(); f.remove(); }
});

test("symlinked projects retain their lexical module-resolution root", () => {
  const f = fixture(), linked = path.join(f.base, "linked-app");
  fs.symlinkSync(f.root, linked);
  const cache = f.load(linked);
  try {
    cache.read();
    assert.ok(f.argumentsSeen.length > 0);
    assert.ok(f.argumentsSeen.every(root => root === linked));
  } finally { cache.close(); f.remove(); }
});
