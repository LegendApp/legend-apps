import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a standalone Apps checkout prepares published and temporary local SDK consumers", () => {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "spark-standalone-apps-")));
  const root = path.join(workspace, "apps");
  const source = path.resolve(import.meta.dirname, "../..");
  try {
    fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
    fs.cpSync(path.join(source, "scripts/lib"), path.join(root, "scripts/lib"), { recursive: true });
    fs.symlinkSync(path.join(source, "node_modules"), path.join(root, "node_modules"));
    fs.mkdirSync(path.join(root, "packages"));
    for (const app of fs.readdirSync(path.join(source, "apps"))) {
      const destination = path.join(root, "apps", app);
      fs.mkdirSync(destination, { recursive: true });
      for (const file of ["package.json", "app.manifest.ts"]) {
        const original = path.join(source, "apps", app, file);
        if (fs.existsSync(original)) fs.copyFileSync(original, path.join(destination, file));
      }
      const modules = path.join(source, "apps", app, "node_modules");
      if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(destination, "node_modules"));
    }
    const repo = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
    const localArchive = path.join(workspace, "sdk.tgz");
    fs.writeFileSync(localArchive, "preparation fixture");
    for (const sdk of ["0.0.1-next.2", "file:../sdk.tgz"]) {
      repo.catalog["@legendapp/spark"] = sdk;
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(repo));
      const result = spawnSync(process.execPath, ["-e", 'import { loadAppManifest } from "./scripts/lib/apps.ts"; import { prepareSparkWorkspace } from "./scripts/lib/sparkWorkspaces.ts"; prepareSparkWorkspace(await loadAppManifest("hello-world"));'], {
        cwd: root, encoding: "utf8", env: { ...process.env, LEGEND_SPARK_ROOT: path.join(workspace, "absent-spark-checkout") },
      });
      assert.equal(result.status, 0, result.stderr);
      const generated = JSON.parse(fs.readFileSync(path.join(root, "shell/.legend/spark/hello-world/package.json"), "utf8"));
      const expected = sdk.startsWith("file:") ? `file:${localArchive}` : sdk;
      assert.equal(generated.dependencies["@legendapp/spark"], expected);
      assert.equal(generated.overrides["@legendapp/spark"], expected);
      assert.ok(Object.values(generated.overrides).every(value => typeof value !== "string" || !value.includes("legend-spark/artifacts")));
      assert.ok(Object.values(generated.patchedDependencies).every(value => typeof value === "string" && path.resolve(root, "shell/.legend/spark/hello-world", value).startsWith(root)));
    }
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
