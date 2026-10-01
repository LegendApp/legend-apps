import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import sparkCapabilities from "./sparkDesktopCapabilities.json";
import { test } from "node:test";
import { appIds, loadAppManifest, loadAppPackageMetadata } from "./apps";
import { prepareSparkWorkspace, sparkCheckout, sparkConfig, sparkMetroBlockList, sparkWorkspace } from "./sparkWorkspaces";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";
import { getMacOSSparkleFeedUrl, getMacOSSparklePublicEdKey } from "./release";

const require = createRequire(import.meta.url);
const { toExpo } = require(path.join(sparkCheckout, "packages/config-plugin/config.cjs"));
const { identity } = require(path.join(sparkCheckout, "packages/config-plugin/identity.cjs"));

test("all workspace consumers resolve the catalog's current Spark SDK", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const repo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(repo.dependencies["@legendapp/spark"], "catalog:");
  assert.equal(repo.overrides?.["@legendapp/spark"], undefined);
  const archives = JSON.parse(fs.readFileSync(path.join(sparkCheckout, "artifacts/packages/manifest.json"), "utf8"));
  assert.ok(repo.catalog["@legendapp/spark"].endsWith(archives["@legendapp/spark"]));
  for (const folder of ["apps", "packages"]) for (const name of fs.readdirSync(path.join(root, folder))) {
    const file = path.join(root, folder, name, "package.json");
    if (!fs.existsSync(file)) continue;
    const dependency = JSON.parse(fs.readFileSync(file, "utf8")).dependencies?.["@legendapp/spark"];
    if (dependency) assert.equal(dependency, "catalog:", `${folder}/${name} must share the current SDK`);
  }
});

test("Metro excludes sibling consumer installs while retaining its dependencies and shared source", () => {
  const patterns = sparkMetroBlockList("code").map(pattern => new RegExp(pattern));
  const blocked = (file: string) => patterns.some(pattern => pattern.test(file));
  assert.equal(blocked(path.join(sparkWorkspace("test-kitchen-sink"), "node_modules/react/index.js")), true);
  assert.equal(blocked(sparkWorkspace("code-other")), true);
  assert.equal(blocked(path.resolve("shell/.legend/workspaces/dev/code/node_modules/react/index.js")), true);
  assert.equal(blocked(path.join(sparkWorkspace("code"), "node_modules/react/index.js")), false);
  assert.equal(blocked(path.join(sparkWorkspace("code"), ".spark/products/app")), true);
  assert.equal(blocked(path.resolve("packages/source-editor/src/index.tsx")), false);
  assert.equal(blocked(path.resolve("apps/code/src/App.tsx")), false);
});

test("generated native config loads the current Spark native API", async () => {
  const manifest = await loadAppManifest("hello-world");
  const project = prepareSparkWorkspace(manifest);
  const config = require(path.join(project, "react-native.config.js"));
  for (const name of sparkConfig(manifest).expo.autolinking.exclude) {
    assert.equal(config.dependencies[name]?.platforms?.macos, null, name);
  }
  assert.equal(typeof config.dependencies["@legendapp/spark-desktop-app"].root, "string");
});

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
    for (const pkg of getExcludedNativePackages(manifest, "macos")) if (pkg.name !== "@legendapp/spark-desktop-app" && !(pkg.name === "@legendapp/spark-desktop-links" && manifest.urlSchemes?.macos?.length)) assert.ok(config.expo.autolinking.exclude.includes(pkg.name));
    assert.ok(!config.expo.autolinking.exclude.includes("@legendapp/spark-desktop-app"));
    assert.equal(config.expo.autolinking.exclude.includes("@legendapp/spark-desktop-windows"), !manifest.nativeModules.macos.includes("@legendapp/spark-desktop-windows"));
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

test("standard desktop capabilities are owned by Spark in every app", async () => {
  const moved = new Set(Object.keys(sparkCapabilities));
  for (const appId of appIds) {
    const manifest = await loadAppManifest(appId);
    if (manifest.nativeModules.macos.includes("@legendapp/spark-file-dialog")) {
      assert.ok(manifest.nativeModules.macos.includes("@legendapp/spark-message-dialog"), "The public dialogs entry includes both file and message dialogs");
    }
    for (const name of manifest.nativeModules.macos) {
      assert.ok(!moved.has(name), `${appId} still links the old desktop module ${name}`);
    }
    const source = path.resolve("apps", appId, "src");
    for (const relative of fs.readdirSync(source, { recursive: true }) as string[]) {
      if (!/\.[cm]?[jt]sx?$/.test(relative)) continue;
      const content = fs.readFileSync(path.join(source, relative), "utf8");
      for (const name of moved) {
        assert.ok(!content.includes(`"${name}"`) && !content.includes(`"${name}/`), `${appId}/${relative} still imports ${name}`);
      }
    }
  }
});

test("recent document lifecycle follows the app option rather than its identity", async () => {
  const manifest = await loadAppManifest("hello-world");
  assert.ok(sparkConfig({ ...manifest, recentDocuments: { macos: true } }).macos.lifecycle.plugins.includes("RNRecentDocumentsStartup"));
});

test("Spark release preserves architecture-specific update identity", async () => {
  const manifest = await loadAppManifest("diff");
  const original = process.env.SPARK_MACOS_ARCH;
  try {
    for (const arch of ["arm", "x86"] as const) {
      process.env.SPARK_MACOS_ARCH = arch === "arm" ? "arm64" : "x64";
      const release = sparkConfig(manifest, "release");
      const plist = identity(toExpo(release).expo);
      assert.equal(plist.SUFeedURL, getMacOSSparkleFeedUrl(manifest, arch));
      assert.equal(plist.SUPublicEDKey, getMacOSSparklePublicEdKey(manifest));
      assert.equal(sparkConfig(manifest).updates, undefined);
    }
  } finally {
    if (original === undefined) delete process.env.SPARK_MACOS_ARCH;
    else process.env.SPARK_MACOS_ARCH = original;
  }
});

test("Photos native packages expose podspecs to the Apple autolinker", () => {
  for (const [directory, pod] of [["photo-library", "RNPhotoLibrary"], ["color-picker", "RNColorPicker"]]) {
    const root = path.resolve("packages", directory);
    const config = require(path.join(root, "react-native.config.js"));
    assert.equal(config.dependency.platforms.ios.podspecPath, `./${pod}.podspec`);
    assert.equal(config.dependency.platforms.macos.podspecPath, `./${pod}.podspec`);
    assert.ok(fs.existsSync(path.join(root, config.dependency.platforms.ios.podspecPath)));
  }
});
