import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "../../app.manifest";
import { getActiveNativePackages } from "../../../../scripts/lib/nativeModules";

test("Slides release includes the native dependencies used by shared settings", () => {
  const releasePackages = getActiveNativePackages(manifest, "macos").map((pkg) => pkg.name);
  for (const dependency of [
    "@legendapp/spark-ui",
    "@legendapp/spark-context-menu",
    "@legendapp/spark-ui",
    "@legendapp/spark-native-menu",
    "@legendapp/spark-settings",
    "@legendapp/spark-desktop-windows",
  ]) {
    assert.ok(releasePackages.includes(dependency), `${dependency} must be linked in release`);
  }
});
