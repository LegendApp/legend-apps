import assert from "node:assert/strict";
import { test } from "node:test";
import { appIds, loadAppManifest, loadAppPackageMetadata } from "./apps";
import { sparkConfig, legacyHostExtension } from "./sparkWorkspaces";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";

for (const appId of appIds) {
  test(`Spark preserves ${appId} identity and explicit native graph`, async () => {
    const manifest = await loadAppManifest(appId);
    const config = sparkConfig(manifest);
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
test("native compatibility extension preserves lifecycle but delegates bundle loading to Spark", () => {
  const { source, header } = legacyHostExtension();
  assert.match(source, /LegendPrecreateRestorableWindows/);
  assert.match(source, /applicationShouldTerminate:/);
  assert.match(source, /applicationShouldHandleReopen:/);
  assert.doesNotMatch(source, /- \(NSURL \*\)bundleURL/);
  assert.match(header, /AppDelegate : RCTAppDelegate/);
});
