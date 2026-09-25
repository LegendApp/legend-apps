import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { appIds, loadAppManifest, loadAppPackageMetadata } from "./apps";
import { sparkCheckout, sparkConfig } from "./sparkWorkspaces";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";

const require = createRequire(import.meta.url);
const { toExpo } = require(path.join(sparkCheckout, "packages/config-plugin/config.cjs"));
const { identity } = require(path.join(sparkCheckout, "packages/config-plugin/identity.cjs"));

for (const appId of appIds) {
  test(`Spark preserves ${appId} identity and explicit native graph`, async () => {
    const manifest = await loadAppManifest(appId);
    const config = sparkConfig(manifest);
    const nativeIdentity = identity(toExpo(config).expo);
    assert.deepEqual(nativeIdentity.SparkLifecycleConfiguration, config.macos.lifecycle);
    assert.equal(nativeIdentity.SparkProjectIdentifier, manifest.bundleIds.macos);
    assert.equal(config.projectId, manifest.bundleIds.macos);
    assert.equal(config.macos.bundleIdentifier, manifest.bundleIds.macos);
    assert.equal(config.version, loadAppPackageMetadata(appId).version);
    assert.deepEqual(config.include, getActiveNativePackages(manifest, "macos").map(pkg => pkg.name));
    for (const pkg of getExcludedNativePackages(manifest, "macos")) assert.ok(config.expo.autolinking.exclude.includes(pkg.name));
    assert.ok(!config.expo.autolinking.exclude.includes("@legendapp/spark-desktop-app"));
    assert.ok(config.expo.autolinking.exclude.includes("@legendapp/spark-desktop-windows"));
    assert.equal(config.macos.infoPlist.LegendHostWindowHidden, manifest.hostWindow?.macos?.hidden ?? false);
    assert.deepEqual(config.scheme, manifest.urlSchemes?.macos);
    const documents = config.macos.infoPlist.CFBundleDocumentTypes;
    for (const [index, type] of (manifest.documentTypes?.macos ?? []).entries()) {
      assert.deepEqual(documents?.[index]?.CFBundleTypeExtensions, type.extensions);
      assert.equal(documents?.[index]?.LSHandlerRank, type.handlerRank ?? "Owner");
    }
  });
}
test("Spark uses native policy without replacing its application delegate", async () => {
  const code = sparkConfig(await loadAppManifest("code"));
  assert.equal(code.macos.lifecycle.mainWindow.hidden, true);
  assert.deepEqual(code.macos.lifecycle.plugins, ["RNWindowManagerStartup", "RNRecentDocumentsStartup"]);
  assert.equal("plugins" in code.expo, false);
  const hello = sparkConfig(await loadAppManifest("hello-world"));
  assert.deepEqual(hello.macos.lifecycle.plugins, []);
  assert.equal(hello.macos.lifecycle.mainWindow.hidden, false);
  const music = sparkConfig(await loadAppManifest("music"));
  assert.equal(music.macos.lifecycle.mainWindow.closeBehavior, "hide");
  const diff = sparkConfig(await loadAppManifest("diff"));
  assert.equal(diff.macos.lifecycle.mainWindow.closeBehavior, "request");
  assert.equal(diff.expo.autolinking.exclude.includes("@legendapp/spark-desktop-links"), false);
  assert.deepEqual(diff.expo.plugins, [path.resolve("packages/diff-parser/app.plugin.cjs")]);
  assert.equal("plugins" in hello.expo, false);
});
