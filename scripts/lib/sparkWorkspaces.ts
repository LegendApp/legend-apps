import fs from "node:fs";
import path from "node:path";
import { appsDir, rootDir, shellDir, loadAppPackageMetadata } from "./apps";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";
import { getMacOSReleaseBuild } from "./release";
import type { AppManifest } from "./types";

export const sparkCheckout = path.resolve(process.env.LEGEND_SPARK_ROOT ?? path.join(rootDir, "../legend-framework"));
export const sparkWorkspace = (appId: string) => path.join(shellDir, ".legend", "spark", appId);

function json(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(file: string, value: string | object) {
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) fs.writeFileSync(file, content);
}

/** Translate app identity and the explicit native module graph into Spark config. */
export function sparkConfig(manifest: AppManifest) {
  const active = getActiveNativePackages(manifest, "macos");
  const excluded = getExcludedNativePackages(manifest, "macos").map(pkg => pkg.name);
  // Keep unused Spark features
  // out of custom development builds too, rather than waiting for release pruning.
  const frameworkPackages = path.join(sparkCheckout, "packages");
  for (const entry of fs.readdirSync(frameworkPackages)) {
    const dir = path.join(frameworkPackages, entry);
    const file = path.join(dir, "package.json");
    if (!fs.existsSync(file)) continue;
    const pkg = json(file);
    if (pkg.name !== "@legendapp/spark-desktop-app" && !(manifest.urlSchemes?.macos?.length && pkg.name === "@legendapp/spark-desktop-links") && (pkg.codegenConfig || pkg.spark?.nativeModules || fs.readdirSync(dir).some(name => name.endsWith(".podspec")))) excluded.push(pkg.name);
  }
  excluded.push("@react-native-runtimes/core", "@op-engineering/op-sqlite");
  if (!manifest.nativeModules.macos.includes("react-native-webview")) excluded.push("react-native-webview");
  return {
    name: manifest.displayName,
    projectId: manifest.bundleIds.macos,
    version: loadAppPackageMetadata(manifest.id).version,
    platforms: ["macos"],
    window: {
      width: manifest.id === "music" ? 360 : manifest.id === "diff" ? 1180 : 1280,
      height: manifest.id === "music" ? 640 : manifest.id === "diff" ? 780 : 720,
      ...(manifest.id === "music" ? { minWidth: 200, minHeight: 300, titleBarStyle: "hidden", appearance: "dark", transparent: true } : {}),
      ...(["chat-history", "diff"].includes(manifest.id) ? { minWidth: 640, minHeight: 460 } : {}),
    },
    macos: {
      bundleIdentifier: manifest.bundleIds.macos,
      buildNumber: getMacOSReleaseBuild(loadAppPackageMetadata(manifest.id)),
      lifecycle: {
        ...(manifest.id === "music" ? { appearance: "dark" } : {}),
        plugins: [
          ...(manifest.nativeModules.macos.includes("@legend-apps/window-manager") ? ["RNWindowManagerStartup"] : []),
          ...(manifest.nativeModules.macos.includes("@legend-apps/recent-documents") ? ["RNRecentDocumentsStartup"] : []),
        ],
        mainWindow: {
          hidden: manifest.hostWindow?.macos?.hidden ?? false,
          autosaveName: manifest.id === "music" ? "MainWindow" : `RCTAppDelegateMainWindow.${manifest.id}`,
          ...(manifest.hostWindow?.macos?.startupBackgroundColors ? { backgroundColors: manifest.hostWindow.macos.startupBackgroundColors } : {}),
          ...(["music", "chat-history"].includes(manifest.id) ? { closeBehavior: "hide" } : {}),
          ...(manifest.id === "music" ? { glass: true } : {}),
          ...(manifest.id === "diff" ? { closeBehavior: "request", reopenBehavior: "visibleWindows" } : {}),
          ...(["chat-history", "diff"].includes(manifest.id) ? { toolbarStyle: "unified", titlebarSeparatorStyle: "shadow" } : {}),
        },
      },
      infoPlist: {
        ...(manifest.id === "chat-history" ? { LegendInitialSplitView: Object.fromEntries(["dark", "light"].map(appearance => [appearance, {
          sidebarWidth: 260, sidebarMinWidth: 220, contentMinWidth: 420, contentTitlebarHeight: 52, appearance,
          backgroundColor: appearance === "dark" ? "#191A1B" : "#f5f6f8",
          sidebarBackgroundColor: appearance === "dark" ? "#2d2e30" : "#f3f4f6",
        }])) } : {}),
        ...(manifest.documentTypes?.macos ? { CFBundleDocumentTypes: manifest.documentTypes.macos.map(type => ({
          CFBundleTypeName: type.name, CFBundleTypeRole: type.role ?? "Editor",
          LSHandlerRank: type.handlerRank ?? "Owner",
          ...(type.extensions ? { CFBundleTypeExtensions: type.extensions } : {}),
          ...(type.contentTypes ? { LSItemContentTypes: type.contentTypes } : {}),
          ...(type.iconFile ? { CFBundleTypeIconFile: type.iconFile } : {}),
        })) } : {}),
        ...manifest.infoPlist?.macos,
        LegendAppId: manifest.id,
        LegendAppDisplayName: manifest.displayName,
        LegendHostWindowHidden: manifest.hostWindow?.macos?.hidden ?? false,
        ...(manifest.hostWindow?.macos?.startupBackgroundColors ? {
          LegendHostWindowDarkBackgroundColor: manifest.hostWindow.macos.startupBackgroundColors.dark,
          LegendHostWindowLightBackgroundColor: manifest.hostWindow.macos.startupBackgroundColors.light,
        } : {}),
      },
    },
    ...(manifest.urlSchemes?.macos ? { scheme: manifest.urlSchemes.macos } : {}),
    // Preserve all document registration fields; Spark's smaller documentTypes
    // contract currently discards extensions and handler rank.
    include: active.map(pkg => pkg.name),
    expo: {
      slug: manifest.id,
      autolinking: { exclude: excluded },
    },
  };
}

export function prepareSparkWorkspace(manifest: AppManifest) {
  const project = sparkWorkspace(manifest.id);
  const sdkManifest = path.join(sparkCheckout, "artifacts/packages/manifest.json");
  if (!fs.existsSync(sdkManifest)) throw new Error(`Pack the local Spark SDK first: cd ${sparkCheckout} && npm run pack:local`);
  const archives = json(sdkManifest) as Record<string, string>;
  if (!archives["@legendapp/spark"]) throw new Error("The local SDK has no @legendapp/spark archive; repack Spark.");
  const template = json(path.join(sparkCheckout, "packages/cli/templates/blank-typescript/package.json"));
  const repo = json(path.join(rootDir, "package.json"));
  const app = json(path.join(appsDir, manifest.id, "package.json"));
  const active = getActiveNativePackages(manifest, "macos");
  const excluded = new Set(getExcludedNativePackages(manifest, "macos").map(pkg => pkg.name));
  const dependencies: Record<string, string> = { ...template.dependencies, ...app.dependencies };
  // Runtimes are optional and these apps do not use worker heaps yet.
  delete dependencies["@react-native-runtimes/core"];
  for (const name of excluded) delete dependencies[name];
  for (const [name, version] of Object.entries(dependencies)) {
    if (version === "catalog:") dependencies[name] = repo.catalog[name];
  }
  const overrides: Record<string, string> = { ...repo.catalog, ...template.overrides, uniwind: "1.6.3", tailwindcss: "4.2.4" };
  for (const [name, archive] of Object.entries(archives)) {
    if (name.startsWith("@legendapp/spark-") && !name.includes("native-greeting")) continue;
    const location = `file:${path.resolve(path.dirname(sdkManifest), archive)}`;
    overrides[name] = location;
    if (name in dependencies) dependencies[name] = location;
  }
  // Keep app libraries as source dependencies while Spark owns the host.
  for (const entry of fs.readdirSync(path.join(rootDir, "packages"))) {
    const dir = path.join(rootDir, "packages", entry);
    if (fs.existsSync(path.join(dir, "package.json"))) overrides[json(path.join(dir, "package.json")).name] = `file:${dir}`;
  }
  for (const pkg of active) dependencies[pkg.name] = `file:${pkg.root}`;
  for (const name of Object.keys(dependencies)) if (overrides[name]) dependencies[name] = overrides[name];
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(project, ".spark"), { recursive: true });
  const settings = path.join(project, ".spark/settings.json");
  if (!fs.existsSync(settings)) write(settings, { target: "dev" });
  write(path.join(project, "package.json"), {
    name: `legend-spark-${manifest.id}`, version: app.version, private: true,
    main: "index.ts", packageManager: "bun@1.3.14", catalog: repo.catalog,
    dependencies, overrides,
  });
  const config = sparkConfig(manifest);
  // Remove source generated by the retired delegate-subclass adapter.
  for (const file of ["HostExtension.mm", "HostExtension.h"]) fs.rmSync(path.join(project, file), { force: true });
  write(path.join(project, "desktop.config.json"), config);
  write(path.join(project, "index.ts"), `import { AppRegistry } from "react-native";\nimport ShellApp from ${JSON.stringify(path.join(shellDir, "src/ShellApp"))};\nAppRegistry.registerComponent("main", () => ShellApp);\n`);
  write(path.join(project, "babel.config.js"), `process.env.LEGEND_APP = ${JSON.stringify(manifest.id)};\nmodule.exports = require(${JSON.stringify(path.join(shellDir, "babel.config.js"))});\n`);
  write(path.join(project, "metro.config.js"), `const path = require("node:path");
const { makeMetroConfig } = require("expo-desktop-metro-config");
const { withDesktop } = require("@legendapp/spark/metro");
const { withUniwindConfig } = require("uniwind/metro");
const config = makeMetroConfig(__dirname);
config.watchFolders = [...new Set([...(config.watchFolders || []), ${JSON.stringify(rootDir)}])];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, "@legend-apps/app": ${JSON.stringify(path.join(appsDir, manifest.id, "src"))} };
config.server.unstable_serverRoot = ${JSON.stringify(rootDir)};
config.resolver.useWatchman = false;
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === "@legend-apps/host-links") return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, "index.ts") }, "@legendapp/spark/links", platform);
  if (/^(react|react-native|react-native-nitro-modules|uniwind)(\\/|$)/.test(name)) context = { ...context, originModulePath: path.join(__dirname, "index.ts") };
  return resolveRequest ? resolveRequest(context, name, platform) : context.resolveRequest(context, name, platform);
};
module.exports = withDesktop(withUniwindConfig(config, { cssEntryFile: ${JSON.stringify(path.relative(project, path.join(shellDir, "src/global.css")))}, dtsFile: "./uniwind-types.d.ts" }), { runtimes: false });
`);
  write(path.join(project, "react-native.config.js"), `// Generated by spark; extend with configuration plugins.
module.exports = require("@legendapp/spark/universal").nativeConfig(__dirname);\n`);
  return project;
}
