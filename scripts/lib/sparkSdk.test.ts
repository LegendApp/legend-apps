import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a standalone checkout prepares consumers of its root install", () => {
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
    repo.catalog["@legendapp/spark"] = "0.0.1";
    const repoSource = JSON.stringify(repo);
    fs.writeFileSync(path.join(root, "package.json"), repoSource);
    const result = spawnSync(process.execPath, ["-e", 'import { loadAppManifest, rootDir } from "./scripts/lib/apps.ts"; import { prepareSparkWorkspace } from "./scripts/lib/sparkWorkspaces.ts"; import { sparkInstallHash } from "./scripts/lib/sparkInstall.ts"; const project = prepareSparkWorkspace(await loadAppManifest("hello-world")); const shared = rootDir; console.log(JSON.stringify({ project, shared, hash: sparkInstallHash(shared, process.cwd()) }));'], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const { project, shared, hash } = JSON.parse(result.stdout);
    assert.equal(shared, root);
    assert.equal(hash.length, 64);
    const generated = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
    assert.equal(generated.dependencies["@legendapp/spark"], repo.catalog["@legendapp/spark"]);
    assert.equal(generated.overrides["@legendapp/spark"], repo.catalog["@legendapp/spark"]);
    assert.equal(fs.existsSync(path.join(project, "node_modules")), false);
    assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), repoSource);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
