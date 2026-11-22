import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertPublishedSpark, configureLocalSpark } from "./localSpark.cjs";

test("local Spark resolves source while peers and tooling use the published install", () => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "legend-spark-local-"));
  const installedRoot = path.join(checkout, "consumer");
  const packages = path.join(checkout, "packages");
  const desktop = path.join(packages, "desktop");
  const settings = path.join(packages, "settings-ui");
  const previous = process.env.LEGEND_SPARK_LOCAL;
  const ci = process.env.CI;
  const config = {
    watchFolders: [installedRoot],
    server: { enhanceMiddleware: undefined },
    resolver: { resolveRequest: (context: { originModulePath: string }, name: string) => [context.originModulePath, name] },
  };
  const app = { originModulePath: path.join(installedRoot, "index.ts") };
  const local = { originModulePath: path.join(fs.realpathSync(checkout), "packages/desktop/ui-settings.ts") };

  try {
    delete process.env.LEGEND_SPARK_LOCAL;
    configureLocalSpark(config, installedRoot);
    assert.deepEqual(config.watchFolders, [installedRoot]);
    assert.deepEqual(config.resolver.resolveRequest(app, "@legendapp/spark/ui/settings"), [app.originModulePath, "@legendapp/spark/ui/settings"]);
    assert.doesNotThrow(assertPublishedSpark);

    process.env.LEGEND_SPARK_LOCAL = checkout;
    process.env.CI = "true";
    assert.throws(assertPublishedSpark, /Unset LEGEND_SPARK_LOCAL/);
    assert.throws(() => configureLocalSpark(config, installedRoot), /Unset LEGEND_SPARK_LOCAL/);
    delete process.env.CI;
    assert.throws(() => configureLocalSpark(config, installedRoot), /must point to a legend-spark checkout/);

    fs.mkdirSync(desktop, { recursive: true });
    fs.mkdirSync(settings);
    fs.writeFileSync(path.join(desktop, "package.json"), JSON.stringify({
      name: "@legendapp/spark", exports: { "./ui/settings": "./ui-settings.ts", "./metro": "./metro.cjs" },
    }));
    fs.writeFileSync(path.join(settings, "package.json"), JSON.stringify({
      name: "@legendapp/spark-settings-ui", main: "src/index.tsx",
    }));
    configureLocalSpark(config, installedRoot);
    const resolve = config.resolver.resolveRequest;
    const realPackages = fs.realpathSync(packages);
    assert.deepEqual(config.watchFolders, [installedRoot, realPackages]);
    assert.equal(resolve(app, "@legendapp/spark/ui/settings")[1], local.originModulePath);
    assert.equal(resolve(app, "@legendapp/spark/metro")[1], "@legendapp/spark/metro");
    assert.equal(resolve(local, "@legendapp/spark-settings-ui")[1], path.join(realPackages, "settings-ui/src/index.tsx"));
    assert.equal(resolve(local, "@legendapp/spark-settings-ui/src/rows")[1], path.join(realPackages, "settings-ui/src/rows"));
    assert.deepEqual(resolve(local, "react"), [path.join(installedRoot, "node_modules/@legendapp/spark/package.json"), "react"]);
    assert.deepEqual(resolve(local, "./sibling"), [local.originModulePath, "./sibling"]);
  } finally {
    if (previous === undefined) delete process.env.LEGEND_SPARK_LOCAL;
    else process.env.LEGEND_SPARK_LOCAL = previous;
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
    fs.rmSync(checkout, { recursive: true, force: true });
  }
});
