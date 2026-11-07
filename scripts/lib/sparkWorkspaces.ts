import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { prepareConfig, type SparkApplicationConfig } from "@legendapp/spark/config";
import path from "node:path";
import { appsDir, rootDir, shellDir, loadAppPackageMetadata } from "./apps";
import { getActiveNativePackages, getExcludedNativePackages } from "./nativeModules";
import { getMacOSReleaseBuild, getMacOSSparkleFeedUrl, getMacOSSparklePublicEdKey } from "./release";
import { getMacOSReleaseMarkdownConfig, getMacOSReleaseProfile } from "./macosReleaseProfile";
import type { AppManifest } from "./types";
import { sparkSdkPackages, sparkSdkRoot } from "./sparkSdk";

export const sharedSparkWorkspace = path.join(shellDir, ".legend", "spark");
export const sparkWorkspace = (appId: string, mode: "dev" | "release" = "dev") => path.join(sharedSparkWorkspace, mode === "release" ? `${appId}-release` : appId);

export function sparkMetroBlockList(appId: string) {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    "/shell/\\.legend/.*/(?:macos|ios|android|\\.spark)/",
    `${escape(path.join(shellDir, ".legend"))}/(?!spark(?:/|$))[^/]+(?:/|$)`,
    // Exclude sibling generated projects; dependencies resolve from the root.
    `${escape(path.join(shellDir, ".legend", "spark"))}/(?!(?:${escape(appId)})(?:/|$))[^/]+(?:/|$)`,
  ];
}

function json(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(file: string, value: string | object) {
  const content = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) {
    const temporary = `${file}.${randomUUID()}`;
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  }
}

/** Translate app identity and the explicit native module graph into Spark config. */
export function sparkConfig(manifest: AppManifest, mode: "dev" | "release" = "dev") {
  const icon = [
    path.join(appsDir, manifest.id, "macos/legendapp-shell-macos/Assets.xcassets/AppIcon.appiconset"),
    path.join(appsDir, manifest.id, "AppIcon.appiconset"),
  ].find(directory => fs.existsSync(directory));
  const iconPluginPath = path.join(rootDir, "scripts/lib/macosAppIcon.cjs");
  const iconPlugin = icon ? [[iconPluginPath, {
    source: icon,
    hash: createHash("sha256").update(fs.readFileSync(iconPluginPath)).update(fs.readdirSync(icon).sort().map(file =>
      `${file}:${createHash("sha256").update(fs.readFileSync(path.join(icon, file))).digest("hex")}`).join("\n")).digest("hex"),
  }] as [string, { source: string; hash: string }]] : [];
  const active = getActiveNativePackages(manifest, "macos");
  const excluded: string[] = [];
  if (mode === "release") {
    excluded.push(...getExcludedNativePackages(manifest, "macos").map(pkg => pkg.name).filter(name => name !== "@legendapp/spark-desktop-app" && !(name === "@legendapp/spark-desktop-links" && manifest.urlSchemes?.macos?.length)));
    for (const pkg of sparkSdkPackages) {
      if (pkg.native && !active.some(activePackage => activePackage.name === pkg.name) && pkg.name !== "@legendapp/spark-desktop-app" && !(manifest.urlSchemes?.macos?.length && pkg.name === "@legendapp/spark-desktop-links")) excluded.push(pkg.name);
    }
    excluded.push("@react-native-runtimes/core", "@op-engineering/op-sqlite");
    if (!manifest.nativeModules.macos.includes("react-native-webview")) excluded.push("react-native-webview");
  }
  return {
    name: manifest.displayName,
    projectId: manifest.bundleIds.macos,
    version: loadAppPackageMetadata(manifest.id).version,
    platforms: ["macos"],
    window: {
      size: { width: manifest.id === "music" ? 360 : manifest.id === "diff" ? 1180 : manifest.id === "photos" ? 1000 : 1280,
        height: manifest.id === "music" ? 640 : manifest.id === "diff" ? 780 : 720 },
      ...(manifest.id === "music" ? { minSize: { width: 200, height: 300 }, titleBarStyle: "hidden", appearance: "dark", transparent: true } : {}),
      ...(["chat-history", "diff", "photos"].includes(manifest.id) ? { minSize: { width: 640, height: 460 } } : {}),
      ...(manifest.id === "photos" ? { titleBarStyle: "hidden" } : {}),
    },
    macos: {
      bundleIdentifier: manifest.bundleIds.macos,
      buildNumber: getMacOSReleaseBuild(loadAppPackageMetadata(manifest.id)),
      lifecycle: {
        ...(manifest.id === "music" ? { appearance: "dark" } : {}),
        plugins: [
          ...(manifest.nativeModules.macos.includes("@legendapp/spark-desktop-windows") ? ["RNWindowManagerStartup"] : []),
          ...(manifest.recentDocuments?.macos ? ["RNRecentDocumentsStartup"] : []),
        ],
        mainWindow: {
          hidden: manifest.hostWindow?.macos?.hidden ?? false,
          autosaveName: manifest.id === "music" ? "MainWindow" : `RCTAppDelegateMainWindow.${manifest.id}`,
          ...(manifest.hostWindow?.macos?.startupBackgroundColors ? { backgroundColors: manifest.hostWindow.macos.startupBackgroundColors } : {}),
          ...(["music", "chat-history", "photos"].includes(manifest.id) ? { closeBehavior: "hide" } : {}),
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
    ...(mode === "release" && manifest.release?.macos ? { updates: { feedURL: getMacOSSparkleFeedUrl(manifest, process.env.SPARK_MACOS_ARCH === "x64" ? "x86" : "arm"), publicKey: getMacOSSparklePublicEdKey(manifest) } } : {}),
    ...(manifest.urlSchemes?.macos ? { scheme: manifest.urlSchemes.macos } : {}),
    // Preserve all document registration fields; Spark's smaller documentTypes
    // contract currently discards extensions and handler rank.
    include: mode === "release" ? active.map(pkg => pkg.name) : [],
    expo: {
      slug: manifest.id,
      // Metro aliases are generated below; Expo's TS setup expects the pre-7 compiler API.
      experiments: { tsconfigPaths: false },
      ...((iconPlugin.length || manifest.nativeModules.macos.includes("@legend-apps/diff-parser")) ? {
        plugins: [
          ...iconPlugin,
          ...(manifest.nativeModules.macos.includes("@legend-apps/diff-parser") ? [path.join(rootDir, "packages/diff-parser/app.plugin.cjs")] : []),
        ],
      } : {}),
      autolinking: { exclude: excluded },
    },
  } satisfies SparkApplicationConfig;
}

export function preservePreviousSparkInstall(project: string) {
  for (const name of ["node_modules", "bun.lock"]) {
    const previous = path.join(project, name);
    if (!fs.existsSync(previous)) continue;
    if (name === "node_modules" && fs.readdirSync(previous).every(entry => entry === ".cache")) {
      fs.rmSync(previous, { recursive: true });
      continue;
    }
    const backup = path.join(path.dirname(project), ".legacy-installs", path.basename(project), name);
    if (fs.existsSync(backup)) throw new Error(`Cannot preserve old Spark install: ${backup} already exists. Move ${previous} before preparing this app.`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(previous, backup);
    if (name === "node_modules") fs.rmSync(path.join(project, ".spark/native-selection.json"), { force: true });
  }
}

export function prepareSparkWorkspace(manifest: AppManifest, mode: "dev" | "release" = "dev", project = sparkWorkspace(manifest.id, mode)) {
  const repo = json(path.join(rootDir, "package.json"));
  const app = json(path.join(appsDir, manifest.id, "package.json"));
  const active = getActiveNativePackages(manifest, "macos");
  const dependencies = { ...repo.dependencies, react: repo.devDependencies.react, "react-native": repo.devDependencies["react-native"] };
  for (const [name, version] of Object.entries(dependencies)) if (version === "catalog:") dependencies[name] = repo.catalog[name];
  preservePreviousSparkInstall(project);
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(path.join(project, ".spark"), { recursive: true });
  const settings = path.join(project, ".spark/settings.json");
  if (!fs.existsSync(settings)) write(settings, { target: "dev" });
  write(path.join(project, ".spark/version"), `${json(path.join(sparkSdkRoot, "package.json")).version}\n`);
  write(path.join(project, "package.json"), {
    name: `legend-spark-${manifest.id}`, version: app.version, private: true,
    main: "index.ts", packageManager: "bun@1.3.14", catalog: repo.catalog,
    dependencies, overrides: { ...repo.overrides, ...dependencies },
    patchedDependencies: Object.fromEntries(Object.entries(repo.patchedDependencies ?? {}).map(([name, file]) => [name, path.relative(project, path.resolve(rootDir, file as string))])),
    ...(active.some(pkg => pkg.name === "react-native-enriched-markdown")
      ? { "enriched-markdown": mode === "release" && getMacOSReleaseProfile(manifest.id) === "benchmark"
        ? getMacOSReleaseMarkdownConfig(manifest.id, repo["enriched-markdown"], app["enriched-markdown"])
        : repo["enriched-markdown"] } : {}),
  });
  const config = sparkConfig(manifest, mode);
  // Remove source generated by the retired delegate-subclass adapter.
  for (const file of ["HostExtension.mm", "HostExtension.h"]) fs.rmSync(path.join(project, file), { force: true });
  write(path.join(project, "desktop.config.json"), config);
  prepareConfig(project);
  write(path.join(project, "index.ts"), `import { registerRootComponent } from "expo";\nimport ShellApp from ${JSON.stringify(path.join(shellDir, "src/ShellApp"))};\nregisterRootComponent(ShellApp);\n`);
  write(path.join(project, "babel.config.js"), `process.env.LEGEND_APP = ${JSON.stringify(manifest.id)};\nmodule.exports = require(${JSON.stringify(path.join(shellDir, "babel.config.js"))});\n`);
  write(path.join(project, "metro.config.js"), `const path = require("node:path");
const { makeMetroConfig } = require("expo-desktop-metro-config");
const { withDesktop } = require("@legendapp/spark/metro");
const { withUniwindConfig } = require("uniwind/metro");
const config = makeMetroConfig(${JSON.stringify(rootDir)});
config.projectRoot = __dirname;
${manifest.id === "slides" ? 'config.cacheVersion = [config.cacheVersion, process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_ARTIFACT || ""].join("|");\n' : ""}config.watchFolders = [...new Set([...(config.watchFolders || []), ${JSON.stringify(rootDir)}])];
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, "@legend-apps/app": ${JSON.stringify(path.join(appsDir, manifest.id, "src"))} };
config.server.unstable_serverRoot = ${mode === "release" ? "__dirname" : JSON.stringify(rootDir)};
config.resolver.useWatchman = false;
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  ...${JSON.stringify(sparkMetroBlockList(path.basename(project)))}.map(pattern => new RegExp(pattern)),
];
const sourceRoots = ${JSON.stringify([appsDir, path.join(rootDir, "packages"), path.join(shellDir, "src")])};
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, name, platform) => {
  if (name === "@legendapp/spark" || name.startsWith("@legendapp/spark/")) return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, "index.ts") }, name, platform);
  if (!name.startsWith(".") && !path.isAbsolute(name) && sourceRoots.some(root => context.originModulePath.startsWith(root + path.sep))) context = { ...context, originModulePath: path.join(__dirname, "index.ts") };
  if (/^(react|react-native|react-native-nitro-modules|react-native-worklets|react-native-reanimated|uniwind|@legendapp\\/state)(\\/|$)/.test(name)) context = { ...context, originModulePath: path.join(__dirname, "index.ts") };
  return resolveRequest ? resolveRequest(context, name, platform) : context.resolveRequest(context, name, platform);
};
module.exports = withDesktop(withUniwindConfig(config, { cssEntryFile: ${JSON.stringify(path.relative(project, path.join(shellDir, "src/global.css")))}, dtsFile: "./uniwind-types.d.ts" }), { runtimes: false });
`);
  write(path.join(project, "react-native.config.js"), `// Generated by spark; extend with configuration plugins.
module.exports = require("@legendapp/spark/native").nativeConfig(__dirname);\n`);
  return project;
}
