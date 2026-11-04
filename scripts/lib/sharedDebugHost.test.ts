import assert from "node:assert/strict";
import { test } from "node:test";
import { appIds, loadAppManifest } from "./apps";
import { debugLaunchProfile } from "./sharedDebugHost";

test("all nine profiles preserve separate native identities, storage names and restoration policy", async () => {
  const profiles = await Promise.all(appIds.map(async id => debugLaunchProfile(await loadAppManifest(id))));
  for (const key of ["CFBundleIdentifier", "CFBundleDisplayName", "SparkProjectIdentifier"]) {
    assert.equal(new Set(profiles.map(profile => profile.infoPlist[key])).size, 9, key);
  }
  for (const [index, profile] of profiles.entries()) {
    const app = appIds[index];
    assert.ok(profile.entry.endsWith(`/spark/${app}-shared-debug/index.ts`));
    assert.equal(profile.infoPlist.LegendAppId, app);
    assert.equal(profile.infoPlist.SparkLifecycleConfiguration.mainWindow.hidden, ["markdown", "code", "slides"].includes(app));
  }
  const music = profiles[appIds.indexOf("music")].infoPlist;
  assert.equal(music.SparkLifecycleConfiguration.appearance, "dark");
  assert.equal(music.SparkLifecycleConfiguration.mainWindow.glass, true);
  assert.equal(music.SparkLifecycleConfiguration.mainWindow.closeBehavior, "hide");
  assert.equal(music.SparkWindowConfiguration.width, 360);
  assert.equal(music.SparkWindowConfiguration.height, 640);
  assert.equal(music.SparkWindowConfiguration.transparent, true);
  const diff = profiles[appIds.indexOf("diff")].infoPlist;
  assert.equal(diff.SparkLifecycleConfiguration.mainWindow.reopenBehavior, "visibleWindows");
  assert.equal(diff.SparkLifecycleConfiguration.mainWindow.closeBehavior, "request");
});
