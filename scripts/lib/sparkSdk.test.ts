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
    fs.symlinkSync(path.join(source, "packages"), path.join(root, "packages"));
    fs.symlinkSync(path.join(source, "patches"), path.join(root, "patches"));
    fs.copyFileSync(path.join(source, "bun.lock"), path.join(root, "bun.lock"));
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
    repo.catalog["@legendapp/spark"] = "0.0.1-next.3";
    const repoSource = JSON.stringify(repo);
    fs.writeFileSync(path.join(root, "package.json"), repoSource);
    for (const archive of ["sdk.tgz", "other.tgz"]) fs.writeFileSync(path.join(workspace, archive), "preparation fixture");
    const localFile = path.join(root, "spark.local.json");
    const hashes: string[] = [];
    const prepare = (envSdk?: string) => spawnSync(process.execPath, ["-e", 'import { loadAppManifest } from "./scripts/lib/apps.ts"; import { prepareSharedSparkInstall, prepareSparkWorkspace } from "./scripts/lib/sparkWorkspaces.ts"; import { sparkInstallHash } from "./scripts/lib/sparkInstall.ts"; prepareSparkWorkspace(await loadAppManifest("hello-world")); const shared = await prepareSharedSparkInstall(); console.log(sparkInstallHash(shared, process.cwd()));'], {
      cwd: root, encoding: "utf8", env: { ...process.env, LEGEND_SPARK_ROOT: path.join(workspace, "absent-spark-checkout"), LEGEND_SPARK_SDK: envSdk },
    });
    for (const sdk of [undefined, "file:../sdk.tgz", "file:../other.tgz", undefined]) {
      if (sdk) fs.writeFileSync(localFile, JSON.stringify({ sdk }));
      else fs.rmSync(localFile, { force: true });
      const result = prepare();
      assert.equal(result.status, 0, result.stderr);
      hashes.push(result.stdout.trim());
      const generated = JSON.parse(fs.readFileSync(path.join(root, "shell/.legend/spark/hello-world/package.json"), "utf8"));
      const expected = sdk ? `file:${path.resolve(root, sdk.slice(5))}` : repo.catalog["@legendapp/spark"];
      assert.equal(generated.dependencies["@legendapp/spark"], expected);
      assert.equal(generated.overrides["@legendapp/spark"], expected);
      assert.equal(generated.catalog["@legendapp/spark"], "0.0.1-next.3");
      assert.equal(fs.readFileSync(path.join(root, "package.json"), "utf8"), repoSource);
      assert.ok(Object.values(generated.overrides).every(value => typeof value !== "string" || !value.includes("legend-spark/artifacts")));
      assert.ok(Object.values(generated.patchedDependencies).every(value => typeof value === "string" && path.resolve(root, "shell/.legend/spark/hello-world", value).startsWith(root)));
    }
    assert.notEqual(hashes[0], hashes[1], "adding a local override must invalidate the install");
    assert.notEqual(hashes[1], hashes[2], "changing the override must invalidate the install");
    assert.equal(hashes[0], hashes[3], "removing the override restores the published install inputs");
    fs.writeFileSync(localFile, JSON.stringify({ sdk: "file:../sdk.tgz" }));
    assert.equal(prepare("file:../other.tgz").status, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "shell/.legend/spark/package.json"), "utf8")).dependencies["@legendapp/spark"], `file:${path.join(workspace, "other.tgz")}`);
    for (const [content, error] of [["{}", /Select a Spark SDK version/], [JSON.stringify({ sdk: "file:../missing.tgz" }), /archive is missing/], ["{", /JSON/]] as const) {
      fs.writeFileSync(localFile, content);
      const result = prepare();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, error);
    }
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});
