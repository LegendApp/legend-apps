import assert from "node:assert/strict";
import { test } from "node:test";
import manifest from "../../app.manifest";
import { getActiveNativePackages } from "../../../../scripts/lib/nativeModules";

test("Slides release includes the native dependencies used by shared settings", () => {
  const releasePackages = getActiveNativePackages(manifest, "macos").map((pkg) => pkg.name);
  for (const dependency of [
    "@legend-apps/appkit-split-view",
    "@legend-apps/context-menu",
    "@legend-apps/native-select",
    "@legend-apps/native-menu",
    "@legend-apps/storage",
    "@legend-apps/window-manager",
  ]) {
    assert.ok(releasePackages.includes(dependency), `${dependency} must be linked in release`);
  }
});
