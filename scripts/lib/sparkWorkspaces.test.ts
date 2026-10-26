import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sparkCapabilities from "./sparkDesktopCapabilities.json";
import { test } from "node:test";
import { appIds, loadAppManifest, loadAppPackageMetadata } from "./apps";
import { expandSparkSubpath } from "./sparkSubpaths";
import { prepareSharedSparkInstall, prepareSparkReleasePackages, prepareSparkWorkspace, preservePreviousSparkInstall, sharedSparkWorkspace, sparkConfig, sparkMetroBlockList, sparkWorkspace } from "./sparkWorkspaces";
import { sparkSdkPackages } from "./sparkSdk";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";
import { getMacOSSparkleFeedUrl, getMacOSSparklePublicEdKey } from "./release";
import { codeMenuConfig } from "../../apps/code/src/codeMenus";
import { diffMenuConfig } from "../../apps/diff/src/diffMenus";
import { markdownMenuConfig } from "../../apps/markdown/src/markdownMenus";

const require = createRequire(import.meta.url);
const sdkRoot = fs.realpathSync(path.resolve("node_modules/@legendapp/spark"));
const { toExpo } = require("@legendapp/spark/config");
const { identity } = require(path.join(sdkRoot, "vendor/node_modules/@legendapp/spark-desktop-config/identity.cjs"));

for (const [app, items] of Object.entries({ code: codeMenuConfig, diff: diffMenuConfig, markdown: markdownMenuConfig })) {
  test(`${app} menus bind native commands without depending on display labels`, async () => {
    const { menuItems } = require(path.join(sdkRoot, "vendor/node_modules/@legendapp/spark-desktop-app/src/contracts/menu.ts"));
    const { composeWindowsMenus } = require(path.join(sdkRoot, "vendor/node_modules/@legendapp/spark-native-menu/src/windows-menus.ts"));
    const native = [
      { id: "native-app", target: { menu: "app" }, items: [{ role: "about" }, { role: "settings" }] },
      { id: "native-file", target: { menu: "file" }, items: ["new", "open", "close", "save", "saveAs"].map(role => ({ role })) },
      { id: "native-edit", target: { menu: "edit" }, items: [{ role: "undo" }, { role: "redo" }] },
      { id: "native-view", target: { menu: "view" }, items: [{ role: "toggleFullscreen" }] },
      { id: "native-window", target: { menu: "window" }, items: [] },
    ];
    const contribution = menuItems(items, { types: ["action", "checkbox", "separator", "submenu", "role"], shortcuts: true, targeting: true }, "macos");
    const result = composeWindowsMenus(new Map([["native", native], [app, contribution]]));
    const manifest = await loadAppManifest(app);
    assert.equal(result.find((item: any) => item.target?.menu === "app").title, manifest.displayName);
    assert.equal(result.filter((item: any) => item.target?.menu === "file").length, 1);
    const file = result.find((item: any) => item.target?.menu === "file");
    assert.equal(file.items.filter((item: any) => item.role === "saveAs" || item.target?.role === "saveAs").length, 1);
  });
}

test("all workspace consumers resolve the locally selected or catalog Spark SDK", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const repo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(repo.dependencies["@legendapp/spark"], "catalog:");
  assert.equal(repo.overrides?.["@legendapp/spark"], undefined);
  const localFile = path.join(root, "spark.local.json");
  const sdk = process.env.LEGEND_SPARK_SDK ?? (fs.existsSync(localFile) ? JSON.parse(fs.readFileSync(localFile, "utf8")).sdk : repo.catalog["@legendapp/spark"]);
  const selectedSdk = sdk.startsWith("file:") ? `file:${path.resolve(root, sdk.slice(5))}` : sdk;
  const project = prepareSparkWorkspace(await loadAppManifest("hello-world"));
  const generated = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
  assert.equal(generated.dependencies["@legendapp/spark"], selectedSdk);
  assert.equal(generated.overrides["@legendapp/spark"], selectedSdk);
  if (!sdk.startsWith("file:")) {
    assert.ok(Object.values(generated.overrides).every(value => typeof value !== "string" || !value.includes("legend-spark/artifacts")));
  }
  for (const pkg of sparkSdkPackages) assert.ok(pkg.root.startsWith(sdkRoot));
  for (const folder of ["apps", "packages"]) for (const name of fs.readdirSync(path.join(root, folder))) {
    const file = path.join(root, folder, name, "package.json");
    if (!fs.existsSync(file)) continue;
    const dependency = JSON.parse(fs.readFileSync(file, "utf8")).dependencies?.["@legendapp/spark"];
    if (dependency) assert.equal(dependency, "catalog:", `${folder}/${name} must share the current SDK`);
  }
});

test("generated workspaces record the installed Spark version for its migration gate", async () => {
  const project = prepareSparkWorkspace(await loadAppManifest("hello-world"));
  const { version } = JSON.parse(fs.readFileSync(path.join(sdkRoot, "package.json"), "utf8"));
  assert.equal(fs.readFileSync(path.join(project, ".spark/version"), "utf8"), `${version}\n`);
});

test("published SDK consumers use the release native archives in the shared install", async () => {
  const release = JSON.parse(fs.readFileSync(path.join(sdkRoot, "vendor/node_modules/@legendapp/spark-cli/dist/release.json"), "utf8"));
  const shared = await prepareSharedSparkInstall();
  const project = prepareSparkWorkspace(await loadAppManifest("markdown"));
  for (const directory of [shared, project]) {
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    for (const [name, asset] of Object.entries(release.packages) as [string, { sha256: string }][]) {
      const archive = path.join(shared, "spark-packages", `${name.replace(/^@/, "").replaceAll("/", "-")}-${asset.sha256}.tgz`);
      assert.equal(pkg.overrides[name], `file:${archive}`, name);
      if (name in pkg.dependencies) assert.equal(pkg.dependencies[name], `file:${archive}`, name);
    }
  }
});

test("offline release preparation verifies archives without downloading", async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "spark-release-offline-"));
  try {
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ dependencies: { "@legendapp/spark": "0.0.1" } }));
    await assert.rejects(prepareSparkReleasePackages(project, true), /archive is missing/);
    const release = JSON.parse(fs.readFileSync(path.join(sdkRoot, "vendor/node_modules/@legendapp/spark-cli/dist/release.json"), "utf8"));
    const [name, asset] = Object.entries(release.packages)[0] as [string, { sha256: string }];
    fs.mkdirSync(path.join(project, "spark-packages"));
    fs.writeFileSync(path.join(project, "spark-packages", `${name.replace(/^@/, "").replaceAll("/", "-")}-${asset.sha256}.tgz`), "corrupt");
    await assert.rejects(prepareSparkReleasePackages(project, true), /archive changed/);
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ dependencies: { "@legendapp/spark": "file:local.tgz" } }));
    await prepareSparkReleasePackages(project, true);
  } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test("Metro excludes sibling consumer installs while retaining its dependencies and shared source", () => {
  const patterns = sparkMetroBlockList("code").map(pattern => new RegExp(pattern));
  const blocked = (file: string) => patterns.some(pattern => pattern.test(file));
  assert.equal(blocked(path.join(sparkWorkspace("test-kitchen-sink"), "node_modules/react/index.js")), true);
  assert.equal(blocked(sparkWorkspace("code-other")), true);
  assert.equal(blocked(path.resolve("shell/.legend/workspaces/dev/code/node_modules/react/index.js")), true);
  assert.equal(blocked(path.join(sparkWorkspace("code"), "node_modules/react/index.js")), false);
  assert.equal(blocked(path.join(sparkWorkspace("code"), ".spark/products/app")), true);
  assert.equal(blocked(path.join(sharedSparkWorkspace, "node_modules/react/index.js")), false);
  assert.equal(blocked(path.join(sharedSparkWorkspace, ".legacy-installs/code/node_modules/react/index.js")), true);
  assert.equal(blocked(path.resolve("packages/source-editor/src/index.tsx")), false);
  assert.equal(blocked(path.resolve("apps/code/src/App.tsx")), false);
});

test("Metro resolves animation runtimes and their self-imports from the native host", async () => {
  const project = prepareSparkWorkspace(await loadAppManifest("hello-world"));
  const config = { server: {}, resolver: { resolveRequest: (context: { originModulePath: string }, _name: string, _platform: string) => context.originModulePath } };
  const module = { exports: {} as typeof config };
  const dependencies: Record<string, unknown> = {
    "node:path": path,
    "expo-desktop-metro-config": { makeMetroConfig: () => config },
    "@legendapp/spark/metro": { withDesktop: (value: unknown) => value },
    "uniwind/metro": { withUniwindConfig: (value: unknown) => value },
  };
  new Function("require", "module", "__dirname", fs.readFileSync(path.join(project, "metro.config.js"), "utf8"))(
    (name: string) => dependencies[name], module, project,
  );
  const context = { originModulePath: path.resolve("apps/slides/node_modules/react-native-worklets/src/createSerializable.ts") };
  for (const name of ["react-native-worklets", "react-native-worklets/src/index", "react-native-reanimated", "react-native-reanimated/lib/module/index"]) {
    assert.equal(module.exports.resolver.resolveRequest(context, name, "macos"), path.join(project, "index.ts"));
  }
  const libraryContext = { originModulePath: path.resolve("packages/presentation/src/index.tsx") };
  assert.equal(module.exports.resolver.resolveRequest(libraryContext, "@shopify/react-native-skia", "macos"), path.join(project, "index.ts"));
  assert.equal(module.exports.resolver.resolveRequest(libraryContext, "./local", "macos"), libraryContext.originModulePath);
  const vendorContext = { originModulePath: path.join(sharedSparkWorkspace, "node_modules/vendor/index.js") };
  assert.equal(module.exports.resolver.resolveRequest(vendorContext, "vendor-peer", "macos"), vendorContext.originModulePath);
});

test("generated native config loads the current Spark native API", async () => {
  const manifest = await loadAppManifest("hello-world");
  const project = prepareSparkWorkspace(manifest);
  const config = require(path.join(project, "react-native.config.js"));
  for (const name of sparkConfig(manifest).expo.autolinking.exclude) {
    assert.equal(config.dependencies[name]?.platforms?.macos, null, name);
  }
});

test("unknown declared native modules cannot be silently excluded", async () => {
  const manifest = await loadAppManifest("hello-world");
  const invalid = { ...manifest, nativeModules: { ...manifest.nativeModules, macos: ["@legend-apps/missing-native-module"] } };
  assert.throws(() => getActiveNativePackages(invalid, "macos"), /unregistered native package/);
});

test("manifests declare Spark modules by import subpath", async () => {
  assert.deepEqual(expandSparkSubpath("@legendapp/spark/dialogs"), ["@legendapp/spark-file-dialog", "@legendapp/spark-message-dialog"]);
  assert.equal(expandSparkSubpath("@legendapp/spark/system")[0], "@legendapp/spark-system");
  assert.throws(() => expandSparkSubpath("@legendapp/spark/nope"), /Unknown Spark native module subpath/);
  assert.deepEqual(expandSparkSubpath("react-native-webview"), ["react-native-webview"]);
  for (const appId of appIds) {
    const source = fs.readFileSync(path.resolve("apps", appId, "app.manifest.ts"), "utf8");
    assert.doesNotMatch(source, /"@legendapp\/spark-[a-z-]+"/, `${appId} must declare Spark modules as @legendapp/spark/<subpath>`);
  }
});

for (const appId of appIds) {
  test(`Spark preserves ${appId} identity and explicit native graph`, async () => {
    const manifest = await loadAppManifest(appId);
    const config = sparkConfig(manifest);
    const expo = toExpo(config).expo;
    const nativeIdentity = identity(expo);
    assert.equal(expo.macos.infoPlist.CFBundleName, manifest.displayName);
    for (const [key, value] of Object.entries(manifest.infoPlist?.macos ?? {})) {
      assert.deepEqual(expo.macos.infoPlist[key], value);
    }
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
      assert.deepEqual(documents?.[index]?.LSItemContentTypes, type.contentTypes);
      assert.equal(documents?.[index]?.CFBundleTypeRole, type.role ?? "Editor");
      assert.equal(documents?.[index]?.CFBundleTypeIconFile, type.iconFile);
    }
  });
}
test("Spark uses native policy without replacing its application delegate", async () => {
  const code = sparkConfig(await loadAppManifest("code"));
  assert.equal(code.macos.lifecycle.mainWindow.hidden, true);
  assert.deepEqual(code.macos.lifecycle.plugins, ["RNWindowManagerStartup", "RNRecentDocumentsStartup"]);
  assert.ok(code.expo.plugins!.every(plugin => Array.isArray(plugin) && plugin[0].endsWith("macosAppIcon.cjs")));
  const hello = sparkConfig(await loadAppManifest("hello-world"));
  assert.deepEqual(hello.macos.lifecycle.plugins, []);
  assert.equal(hello.macos.lifecycle.mainWindow.hidden, false);
  const music = sparkConfig(await loadAppManifest("music"));
  assert.equal(music.macos.lifecycle.mainWindow.closeBehavior, "hide");
  const diff = sparkConfig(await loadAppManifest("diff"));
  assert.equal(diff.macos.lifecycle.mainWindow.closeBehavior, "request");
  assert.equal(diff.expo.autolinking.exclude.includes("@legendapp/spark-desktop-links"), false);
  assert.equal(diff.expo.plugins!.at(-1), path.resolve("packages/diff-parser/app.plugin.cjs"));
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

for (const appId of ["slides", "code", "diff", "markdown", "chat-history", "photos"]) {
  test(`Spark compiles ${appId}'s icon with a mask and preserves its artwork`, { timeout: 60_000 }, async () => {
    const config = sparkConfig(await loadAppManifest(appId));
    const [pluginPath, options] = config.expo.plugins!.find(plugin => Array.isArray(plugin)) as [string, { source: string; hash: string }];
    assert.match(options.hash, /^[a-f0-9]{64}$/);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "legend-app-icon-"));
    try {
      const appRoot = path.join(temporary, "macos/legendapp-shell-macos");
      const target = path.join(appRoot, "Assets.xcassets/AppIcon.appiconset");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "Contents.json"), '{"images":[]}');
      fs.writeFileSync(path.join(path.dirname(target), "Contents.json"), '{"info":{"author":"xcode","version":1}}');
      const plugin = require(pluginPath);
      const mod = plugin({ _internal: { projectRoot: sparkWorkspace("slides") } }, options);
      const request = { platformProjectRoot: path.join(temporary, "macos") };
      const xcode = require(require.resolve("xcode", { paths: [sparkWorkspace("slides")] }));
      const project = xcode.project(path.resolve("shell/macos/legendapp-shell-macos.xcodeproj/project.pbxproj"));
      project.parseSync();
      const input = { ...mod, modRequest: request, modResults: project };
      await mod.mods.macos.xcodeproj(input);
      const first = project.writeSync();
      await mod.mods.macos.xcodeproj(input);
      assert.equal(project.writeSync(), first, "regeneration must not duplicate Xcode resources");
      const icon = path.join(appRoot, "AppIcon.icon");
      if (appId === "photos") {
        assert.equal(fs.existsSync(icon), false);
        const catalog = JSON.parse(fs.readFileSync(path.join(target, "Contents.json"), "utf8"));
        for (const image of catalog.images) {
          assert.deepEqual(fs.readFileSync(path.join(target, image.filename)), fs.readFileSync(path.join(options.source, image.filename)));
        }
      } else {
        assert.equal(fs.existsSync(target), false);
        const reference = project.hasFile("AppIcon.icon");
        assert.equal(reference.lastKnownFileType, "folder.iconcomposer.icon");
        const macTarget = project.findTargetKey('"legendapp-shell-macos"');
        const phase = project.pbxResourcesBuildPhaseObj(macTarget);
        assert.equal(phase.files.filter((file: any) => file.comment.includes("AppIcon.icon")).length, 1);
        const iosPhase = project.pbxResourcesBuildPhaseObj(project.findTargetKey('"legendapp-shell-ios"'));
        assert.ok(!iosPhase.files.some((file: any) => file.comment.includes("AppIcon.icon")));
        const images = JSON.parse(fs.readFileSync(path.join(options.source, "Contents.json"), "utf8")).images;
        const artwork = images.find((image: any) => image.size === "512x512" && image.scale === "2x");
        assert.deepEqual(fs.readFileSync(path.join(icon, "Assets/Artwork.png")), fs.readFileSync(path.join(options.source, artwork.filename)));
        if (process.platform === "darwin") {
          const output = path.join(temporary, "compiled");
          fs.mkdirSync(output);
          execFileSync("xcrun", ["actool", path.dirname(target), icon, "--compile", output, "--app-icon", "AppIcon", "--platform", "macosx",
            "--minimum-deployment-target", "14.0", "--output-partial-info-plist", path.join(output, "icon-info.plist")]);
          const assets = JSON.parse(execFileSync("xcrun", ["assetutil", "--info", path.join(output, "Assets.car")], { encoding: "utf8" }));
          assert.ok(assets.some((asset: any) => asset.Name === "AppIcon" && asset.AssetType === "IconImageStack"));
          assert.ok(assets.some((asset: any) => asset.Name === "AppIcon" && asset.AssetType === "MultiSized Image"));
          const samples = JSON.parse(execFileSync("osascript", ["-l", "JavaScript", "-e", `
            ObjC.import("AppKit");
            var image = $.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(path.join(output, "AppIcon.icns"))});
            var result = [];
            for (var i = 0; i < image.representations.count; i++) {
              var rep = image.representations.objectAtIndex(i), size = Number(rep.pixelsWide);
              result.push({ size: size, corner: Number(rep.colorAtXY(0, 0).alphaComponent),
                innerCorner: Number(rep.colorAtXY(Math.floor(size * .1), Math.floor(size * .1)).alphaComponent),
                center: Number(rep.colorAtXY(Math.floor(size / 2), Math.floor(size / 2)).alphaComponent) });
            }
            JSON.stringify(result);
          `], { encoding: "utf8" }));
          assert.ok(samples.some((sample: any) => sample.size >= 256));
          for (const sample of samples) {
            assert.equal(sample.corner, 0);
            assert.equal(sample.innerCorner, 0);
            assert.equal(sample.center, 1);
          }
        }
        if (appId === "slides") {
          const photos = sparkConfig(await loadAppManifest("photos"));
          const [, photoOptions] = photos.expo.plugins![0] as [string, { source: string; hash: string }];
          const photoMod = plugin({ _internal: { projectRoot: sparkWorkspace("slides") } }, photoOptions);
          await photoMod.mods.macos.xcodeproj({ ...photoMod, modRequest: request, modResults: project });
          assert.equal(fs.existsSync(icon), false);
          assert.equal(project.hasFile("AppIcon.icon"), false);
          assert.ok(fs.existsSync(target));
          assert.ok(!phase.files.some((file: any) => file.comment.includes("AppIcon.icon")));
          await mod.mods.macos.xcodeproj(input);
          assert.equal(fs.existsSync(target), false);
          assert.ok(project.hasFile("AppIcon.icon"));
        }
      }
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
}

test("shared install holds every app dependency while projects keep their native selection", async () => {
  const shared = await prepareSharedSparkInstall();
  const pkg = JSON.parse(fs.readFileSync(path.join(shared, "package.json"), "utf8"));
  assert.deepEqual(pkg.workspaces, ["../../../packages/*"]);
  for (const appId of appIds) {
    const manifest = await loadAppManifest(appId);
    const project = prepareSparkWorkspace(manifest);
    const app = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
    assert.equal(app.workspaces, undefined);
    for (const [name, version] of Object.entries(app.dependencies)) assert.equal(pkg.dependencies[name], version, name);
    for (const native of getExcludedNativePackages(manifest, "macos")) assert.equal(app.dependencies[native.name], undefined, `${appId}: ${native.name}`);
  }
  assert.equal(pkg.dependencies["@legend-apps/source-editor"], "workspace:*");
  const hello = await loadAppManifest("hello-world");
  assert.equal(prepareSparkWorkspace(hello, "release"), sparkWorkspace("hello-world", "release"));
  assert.notEqual(sparkWorkspace("hello-world"), sparkWorkspace("hello-world", "release"));
});

test("Spark Release workspaces apply benchmark Markdown options only to Chat History exports", async () => {
  const previous = process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
  const manifest = await loadAppManifest("chat-history");
  const config = (mode: "dev" | "release") => {
    const project = prepareSparkWorkspace(manifest, mode);
    return JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"))["enriched-markdown"];
  };
  try {
    delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
    const regular = config("release");
    assert.equal(regular.externalCodeHighlightGrammars, undefined);
    process.env.LEGEND_CHAT_HISTORY_BENCHMARK = "1";
    const benchmark = config("release");
    assert.equal(benchmark.externalCodeHighlightGrammars, true);
    assert.equal(benchmark.codeHighlightLanguages.length, 19);
    assert.equal(config("dev").externalCodeHighlightGrammars, undefined);
    delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
    assert.deepEqual(config("release"), regular);
  } finally {
    if (previous === undefined) delete process.env.LEGEND_CHAT_HISTORY_BENCHMARK;
    else process.env.LEGEND_CHAT_HISTORY_BENCHMARK = previous;
  }
});

test("preparing a shared consumer preserves old installs without leaving a shadowing node_modules", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-previous-install-"));
  const project = path.join(root, "example");
  try {
    fs.mkdirSync(path.join(project, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(project, "node_modules/source.js"), "old source");
    fs.writeFileSync(path.join(project, "bun.lock"), "old lock");
    fs.mkdirSync(path.join(project, ".spark"));
    fs.writeFileSync(path.join(project, ".spark/native-selection.json"), "stale native roots");
    preservePreviousSparkInstall(project);
    preservePreviousSparkInstall(project);
    const backup = path.join(root, ".legacy-installs/example");
    assert.equal(fs.existsSync(path.join(project, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(project, ".spark/native-selection.json")), false);
    assert.equal(fs.readFileSync(path.join(backup, "node_modules/source.js"), "utf8"), "old source");
    assert.equal(fs.readFileSync(path.join(backup, "bun.lock"), "utf8"), "old lock");
    fs.mkdirSync(path.join(project, "node_modules/.cache"), { recursive: true });
    fs.writeFileSync(path.join(project, "node_modules/.cache/metro"), "cache");
    preservePreviousSparkInstall(project);
    assert.equal(fs.readFileSync(path.join(project, "node_modules/.cache/metro"), "utf8"), "cache");
    fs.writeFileSync(path.join(project, "node_modules/source.js"), "another install");
    assert.throws(() => preservePreviousSparkInstall(project), /already exists/);
    assert.ok(fs.existsSync(path.join(project, "node_modules")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
