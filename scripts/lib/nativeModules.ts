import fs from "node:fs";
import path from "node:path";
import { appIds, appsDir, loadAppPackageMetadata, packagesDir, rootDir, shellDir } from "./apps";
import { writeMacOSInfoPlist } from "./macosInfoPlist";
import type { AppManifest, MacOSReleaseArch, NativePackage, Platform } from "./types";
import { sparkSdkPackages } from "./sparkSdk";

export type NativeGraphMode = "dev" | "release";

/**
 * Registry native modules are installed per consuming app, so resolve their
 * installed copy instead of pinning one app's `node_modules`. App copies run
 * the package's install hooks; the root copy can be an unvendored extract.
 */
function installedNativePackage(name: string) {
  for (const app of appIds) {
    const root = path.join(appsDir, app, "node_modules", name);
    if (fs.existsSync(path.join(root, "package.json"))) return path.resolve(root);
  }
  const root = path.join(rootDir, "node_modules", name);
  if (fs.existsSync(path.join(root, "package.json"))) return path.resolve(root);
  throw new Error(`${name} is not installed. Run bun install before building a native app.`);
}

export const nativePackages: NativePackage[] = [
  {name: "@legend-apps/color-picker", root: path.join(packagesDir, "color-picker"), platforms: ["macos"]},
  {name: "@legend-apps/photo-library", root: path.join(packagesDir, "photo-library"), platforms: ["macos"]},
  ...sparkSdkPackages.filter(pkg => pkg.native).map(pkg => ({
    name: pkg.name,
    root: pkg.root,
    platforms: ["macos"] as Platform[],
  })),
  {
    name: "@legend-apps/source-editor",
    root: path.join(packagesDir, "source-editor"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/apple-music",
    root: path.join(packagesDir, "apple-music"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/oauth-loopback",
    root: path.join(packagesDir, "oauth-loopback"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/crypto",
    root: path.join(packagesDir, "crypto"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/chat-history",
    root: path.join(packagesDir, "chat-history"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/app-exit",
    root: path.join(packagesDir, "app-exit"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/auto-updater",
    root: path.join(packagesDir, "auto-updater"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/command-runner",
    root: path.join(packagesDir, "command-runner"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/appkit-split-view",
    root: path.join(packagesDir, "appkit-split-view"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/audio-player",
    root: path.join(packagesDir, "audio-player"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/native-menu",
    root: path.join(packagesDir, "native-menu"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/native-select",
    root: path.join(packagesDir, "native-select"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/recent-documents",
    root: path.join(packagesDir, "recent-documents"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/sidebar",
    root: path.join(packagesDir, "sidebar"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/storage",
    root: path.join(packagesDir, "storage"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/file-dialog",
    root: path.join(packagesDir, "file-dialog"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/context-menu",
    root: path.join(packagesDir, "context-menu"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/document-scanner",
    root: path.join(packagesDir, "document-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/drag-drop",
    root: path.join(packagesDir, "drag-drop"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/file-scanner",
    root: path.join(packagesDir, "file-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/window-controls",
    root: path.join(packagesDir, "window-controls"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/window-manager",
    root: path.join(packagesDir, "window-manager"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/global-hotkey",
    root: path.join(packagesDir, "global-hotkey"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/keyboard-manager",
    root: path.join(packagesDir, "keyboard-manager"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/file-system-watcher",
    root: path.join(packagesDir, "file-system-watcher"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/glass-effect-view",
    root: path.join(packagesDir, "glass-effect-view"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/instrumentation",
    root: path.join(packagesDir, "instrumentation"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/media-library-scanner",
    root: path.join(packagesDir, "media-library-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/media-tags",
    root: path.join(packagesDir, "media-tags"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/markdown-parser",
    root: path.join(packagesDir, "markdown-parser"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/syntax-parser",
    root: path.join(packagesDir, "syntax-parser"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/diff-parser",
    root: path.join(packagesDir, "diff-parser"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-apps/markdown-block-editor",
    root: path.join(packagesDir, "markdown-block-editor"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/scaled-view",
    root: path.join(packagesDir, "scaled-view"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/sf-symbol",
    root: path.join(packagesDir, "sf-symbol"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-apps/text-input-search",
    root: path.join(packagesDir, "text-input-search"),
    platforms: ["macos", "ios"],
  },
  {
    name: "react-native-enriched-markdown",
    root: installedNativePackage("react-native-enriched-markdown"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "react-native-webview",
    root: installedNativePackage("react-native-webview"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@shopify/react-native-skia",
    root: installedNativePackage("@shopify/react-native-skia"),
    platforms: ["macos"],
  },
  {
    name: "lottie-react-native",
    root: installedNativePackage("lottie-react-native"),
    platforms: ["macos"],
  },
  ...["react-native-reanimated", "react-native-worklets"].map((name) => ({
    name,
    root: installedNativePackage(name),
    platforms: ["macos"] as Platform[],
  })),
  {
    name: "react-native-webgpu",
    root: installedNativePackage("react-native-webgpu"),
    platforms: ["macos"],
  },
];

export function getActiveNativePackages(manifest: AppManifest, platform: Platform) {
  const selected = new Set(manifest.nativeModules[platform] ?? []);
  const available = nativePackages.filter((pkg) => pkg.platforms.includes(platform));
  const names = new Set(available.map(pkg => pkg.name));
  for (const name of selected) {
    if (!names.has(name)) throw new Error(`${manifest.id}/${platform} declares unregistered native package ${name}`);
  }
  return available.filter(pkg => selected.has(pkg.name));
}

export function getExcludedNativePackages(manifest: AppManifest, platform: Platform) {
  const selected = new Set(manifest.nativeModules[platform] ?? []);
  return nativePackages.filter((pkg) => pkg.platforms.includes(platform) && !selected.has(pkg.name));
}

export function getAllNativePackages(platform: Platform) {
  return nativePackages.filter((pkg) => pkg.platforms.includes(platform));
}

export function generatedDir(appId: string, platform: Platform, mode: NativeGraphMode = "release") {
  return path.join(shellDir, ".legend", "config", mode, appId, platform);
}

export function writeGeneratedConfig(
  manifest: AppManifest,
  platform: Platform,
  mode: NativeGraphMode = "release",
  macOSReleaseArch: MacOSReleaseArch = "arm",
) {
  const dir = generatedDir(manifest.id, platform, mode);
  const appPackage = loadAppPackageMetadata(manifest.id);
  fs.mkdirSync(dir, { recursive: true });

  const activePackages =
    mode === "dev"
      ? getAllNativePackages(platform)
      : getActiveNativePackages(manifest, platform);
  const excludedPackages =
    mode === "dev"
      ? []
      : getExcludedNativePackages(manifest, platform);

  const activeNativePackages = activePackages.map((pkg) => ({
    ...pkg,
    root: path.relative(rootDir, pkg.root),
  }));

  const excludedNativePackages = excludedPackages.map((pkg) => ({
    ...pkg,
    root: path.relative(rootDir, pkg.root),
  }));

  const appConfig = {
    ...manifest,
    activeNativePackages,
    appPackage,
    excludedNativePackages,
    nativeGraphMode: mode,
    platform,
  };

  fs.writeFileSync(path.join(dir, "app-config.json"), `${JSON.stringify(appConfig, null, 2)}\n`);
  fs.writeFileSync(
    path.join(dir, "active-native-modules.json"),
    `${JSON.stringify(activeNativePackages, null, 2)}\n`,
  );

  const macosInfoPlistPath = platform === "macos"
    ? writeMacOSInfoPlist(manifest, appPackage, dir, mode, macOSReleaseArch)
    : undefined;

  return {
    config: appConfig,
    configPath: path.join(dir, "app-config.json"),
    dir,
    macosInfoPlistPath,
  };
}
