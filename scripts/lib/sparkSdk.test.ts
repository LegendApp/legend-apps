import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a standalone checkout prepares a stale Spark install before dispatching run and migrates offline", () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "spark-standalone-apps-")));
  const root = path.join(workspace, "apps");
  const source = path.resolve(import.meta.dirname, "../..");
  try {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.cpSync(path.join(source, "scripts/lib"), path.join(root, "scripts/lib"), { recursive: true });
    fs.symlinkSync(path.join(source, "node_modules"), path.join(root, "node_modules"));
    fs.symlinkSync(path.join(source, "packages"), path.join(root, "packages"));
    fs.symlinkSync(path.join(source, "patches"), path.join(root, "patches"));
    fs.copyFileSync(path.join(source, "bun.lock"), path.join(root, "bun.lock"));
    for (const app of fs.readdirSync(path.join(source, "apps"))) {
      const destination = path.join(root, "apps", app);
      fs.mkdirSync(destination, { recursive: true });
      for (const file of ["package.json", "app.manifest.ts", "scripts/benchmark-markdown.json"]) {
        const original = path.join(source, "apps", app, file);
        if (fs.existsSync(original)) {
          fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
          fs.copyFileSync(original, path.join(destination, file));
        }
      }
      const modules = path.join(source, "apps", app, "node_modules");
      if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(destination, "node_modules"));
    }
    fs.mkdirSync(path.join(root, "shell"));
    fs.copyFileSync(path.join(source, "shell/package.json"), path.join(root, "shell/package.json"));
    const repo = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
    const repoSource = JSON.stringify(repo);
    fs.writeFileSync(path.join(root, "package.json"), repoSource);
    fs.writeFileSync(path.join(root, "spark.local.json"), JSON.stringify({ sdk: "file:missing-sdk.tgz" }));
    const sharedWorkspace = path.join(root, "shell/.legend/spark");
    const sdkManifest = "node_modules/@legendapp/spark/package.json";
    const oldSdk = JSON.stringify({ name: "@legendapp/spark", version: "0.0.3", spark: { bundledModuleRoot: "vendor" } });
    fs.mkdirSync(path.dirname(path.join(sharedWorkspace, sdkManifest)), { recursive: true });
    fs.writeFileSync(path.join(sharedWorkspace, sdkManifest), oldSdk);
    fs.writeFileSync(path.join(sharedWorkspace, "bun.lock"), "legacy lock");
    const state = path.join(sharedWorkspace, "hello-world/.spark");
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, "version"), "0.0.3\n");
    fs.copyFileSync(path.join(source, "scripts/run-app.ts"), path.join(root, "scripts/run-app.ts"));
    const bin = path.join(workspace, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "bun"), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    const run = spawnSync(process.execPath, ["scripts/run-app.ts", "hello-world", "run", "--offline"], {
      cwd: root, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, "scripts/spark-app.ts\nhello-world\nrun\n--offline\n");
    assert.equal(fs.existsSync(path.join(sharedWorkspace, "node_modules")), false, "run must prepare Spark before dispatching to the shared Debug host");

    const result = spawnSync(process.execPath, ["-e", 'import { loadAppManifest, rootDir } from "./scripts/lib/apps.ts"; import { prepareSparkWorkspace } from "./scripts/lib/sparkWorkspaces.ts"; import { sparkInstallHash } from "./scripts/lib/sparkInstall.ts"; const manifest = await loadAppManifest("hello-world"); const project = prepareSparkWorkspace(manifest); prepareSparkWorkspace(manifest); const shared = rootDir; console.log(JSON.stringify({ project, shared, hash: sparkInstallHash(shared, process.cwd()) }));'], { cwd: root, encoding: "utf8", env: { ...process.env, LEGEND_SPARK_SDK: "file:another-missing-sdk.tgz", LEGEND_OFFLINE: "1", EXPO_OFFLINE: "1" } });
    assert.equal(result.status, 0, result.stderr);
    const { project, shared, hash } = JSON.parse(result.stdout);
    assert.equal(shared, root);
    assert.equal(hash.length, 64);
    const generated = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
    assert.equal(generated.dependencies["@legendapp/spark"], repo.catalog["@legendapp/spark"]);
    assert.equal(generated.overrides["@legendapp/spark"], repo.catalog["@legendapp/spark"]);
    assert.equal(fs.existsSync(path.join(project, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(sharedWorkspace, "node_modules")), false);
    const backup = path.join(root, "shell/.legend/.legacy-installs/spark");
    assert.equal(fs.readFileSync(path.join(backup, sdkManifest), "utf8"), oldSdk);
    assert.equal(fs.readFileSync(path.join(backup, "bun.lock"), "utf8"), "legacy lock");
    assert.equal(fs.readFileSync(path.join(state, "version"), "utf8"), `${repo.catalog["@legendapp/spark"]}\n`);
    assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), repoSource);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
