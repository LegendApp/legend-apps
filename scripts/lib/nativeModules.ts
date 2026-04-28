import fs from "node:fs";
import path from "node:path";
import { packagesDir, rootDir, shellDir } from "./apps";
import type { AppManifest, NativePackage, Platform } from "./types";

export const nativePackages: NativePackage[] = [
  {
    name: "@legend-desktop/app-exit",
    root: path.join(packagesDir, "app-exit"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/auto-updater",
    root: path.join(packagesDir, "auto-updater"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/appkit-split-view",
    root: path.join(packagesDir, "appkit-split-view"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/native-menu",
    root: path.join(packagesDir, "native-menu"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/sidebar",
    root: path.join(packagesDir, "sidebar"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/file-dialog",
    root: path.join(packagesDir, "file-dialog"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/context-menu",
    root: path.join(packagesDir, "context-menu"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/document-scanner",
    root: path.join(packagesDir, "document-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/file-scanner",
    root: path.join(packagesDir, "file-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/window-controls",
    root: path.join(packagesDir, "window-controls"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/window-manager",
    root: path.join(packagesDir, "window-manager"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/global-hotkey",
    root: path.join(packagesDir, "global-hotkey"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/file-system-watcher",
    root: path.join(packagesDir, "file-system-watcher"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/glass-effect-view",
    root: path.join(packagesDir, "glass-effect-view"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/media-library-scanner",
    root: path.join(packagesDir, "media-library-scanner"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/media-tags",
    root: path.join(packagesDir, "media-tags"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/markdown-parser",
    root: path.join(packagesDir, "markdown-parser"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/sf-symbol",
    root: path.join(packagesDir, "sf-symbol"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "react-native-enriched-markdown",
    root: path.join(rootDir, "apps", "test-kitchen-sink", "node_modules", "react-native-enriched-markdown"),
    platforms: ["macos", "ios", "android"],
  },
];

export function getActiveNativePackages(manifest: AppManifest, platform: Platform) {
  const selected = new Set(manifest.nativeModules[platform] ?? []);
  return nativePackages.filter((pkg) => selected.has(pkg.name));
}

export function getExcludedNativePackages(manifest: AppManifest, platform: Platform) {
  const selected = new Set(manifest.nativeModules[platform] ?? []);
  return nativePackages.filter((pkg) => !selected.has(pkg.name));
}

export function generatedDir(appId: string, platform: Platform) {
  return path.join(shellDir, ".legend", "generated", appId, platform);
}

export function writeGeneratedConfig(manifest: AppManifest, platform: Platform) {
  const dir = generatedDir(manifest.id, platform);
  fs.mkdirSync(dir, { recursive: true });

  const activeNativePackages = getActiveNativePackages(manifest, platform).map((pkg) => ({
    ...pkg,
    root: path.relative(rootDir, pkg.root),
  }));

  const excludedNativePackages = getExcludedNativePackages(manifest, platform).map((pkg) => ({
    ...pkg,
    root: path.relative(rootDir, pkg.root),
  }));

  const appConfig = {
    ...manifest,
    activeNativePackages,
    excludedNativePackages,
    platform,
  };

  fs.writeFileSync(path.join(dir, "app-config.json"), `${JSON.stringify(appConfig, null, 2)}\n`);
  fs.writeFileSync(
    path.join(dir, "active-native-modules.json"),
    `${JSON.stringify(activeNativePackages, null, 2)}\n`,
  );

  return appConfig;
}
