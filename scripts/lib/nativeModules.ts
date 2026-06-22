import fs from "node:fs";
import path from "node:path";
import { packagesDir, rootDir, shellDir } from "./apps";
import { writeMacOSInfoPlist } from "./macosInfoPlist";
import type { AppManifest, NativePackage, Platform } from "./types";

export type NativeGraphMode = "dev" | "release";

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
    name: "@legend-desktop/command-runner",
    root: path.join(packagesDir, "command-runner"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-desktop/appkit-split-view",
    root: path.join(packagesDir, "appkit-split-view"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/audio-player",
    root: path.join(packagesDir, "audio-player"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-desktop/native-menu",
    root: path.join(packagesDir, "native-menu"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/recent-documents",
    root: path.join(packagesDir, "recent-documents"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/sidebar",
    root: path.join(packagesDir, "sidebar"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/storage",
    root: path.join(packagesDir, "storage"),
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
    name: "@legend-desktop/drag-drop",
    root: path.join(packagesDir, "drag-drop"),
    platforms: ["macos", "ios"],
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
    name: "@legend-desktop/keyboard-manager",
    root: path.join(packagesDir, "keyboard-manager"),
    platforms: ["macos", "ios"],
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
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-desktop/syntax-parser",
    root: path.join(packagesDir, "syntax-parser"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-desktop/diff-parser",
    root: path.join(packagesDir, "diff-parser"),
    platforms: ["macos", "ios"],
  },
  {
    name: "@legend-desktop/markdown-block-editor",
    root: path.join(packagesDir, "markdown-block-editor"),
    platforms: ["macos"],
  },
  {
    name: "@legend-desktop/sf-symbol",
    root: path.join(packagesDir, "sf-symbol"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "@legend-desktop/text-input-search",
    root: path.join(packagesDir, "text-input-search"),
    platforms: ["macos", "ios"],
  },
  {
    name: "react-native-enriched-markdown",
    root: path.join(rootDir, "apps", "test-kitchen-sink", "node_modules", "react-native-enriched-markdown"),
    platforms: ["macos", "ios", "android"],
  },
];

export function getActiveNativePackages(manifest: AppManifest, platform: Platform) {
  const selected = new Set(manifest.nativeModules[platform] ?? []);
  return nativePackages.filter((pkg) => pkg.platforms.includes(platform) && selected.has(pkg.name));
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
) {
  const dir = generatedDir(manifest.id, platform, mode);
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
    excludedNativePackages,
    nativeGraphMode: mode,
    platform,
  };

  fs.writeFileSync(path.join(dir, "app-config.json"), `${JSON.stringify(appConfig, null, 2)}\n`);
  fs.writeFileSync(
    path.join(dir, "active-native-modules.json"),
    `${JSON.stringify(activeNativePackages, null, 2)}\n`,
  );

  const macosInfoPlistPath = platform === "macos" ? writeMacOSInfoPlist(manifest, dir) : undefined;

  return {
    config: appConfig,
    configPath: path.join(dir, "app-config.json"),
    dir,
    macosInfoPlistPath,
  };
}
