import assert from "node:assert/strict";
import { test } from "node:test";
import appPackage from "../../package.json";
import { loadAppManifest } from "../../../../scripts/lib/apps";
import { getActiveNativePackages } from "../../../../scripts/lib/nativeModules";

test("Slides release includes the native dependencies used by shared settings", async () => {
  const manifest = await loadAppManifest("slides");
  const releasePackages = getActiveNativePackages(manifest, "macos").map((pkg) => pkg.name);
  for (const dependency of [
    "@legendapp/spark-ui",
    "@legendapp/spark-context-menu",
    "@legendapp/spark-native-menu",
    "@legend-apps/storage",
    "@legendapp/spark-desktop-windows",
  ]) {
    assert.ok(releasePackages.includes(dependency), `${dependency} must be linked in release`);
  }
});

test("Slides declares the Legend List peer required by Spark settings windows", () => {
  assert.ok(appPackage.dependencies["@legendapp/list"]);
});
