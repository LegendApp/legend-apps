import fs from "node:fs";
import path from "node:path";
import { loadAppPackageMetadata, packagesDir, rootDir, shellDir } from "./apps";
import { writeMacOSInfoPlist } from "./macosInfoPlist";
import type { AppManifest, MacOSReleaseArch, NativePackage, Platform } from "./types";

export type NativeGraphMode = "dev" | "release";

export const nativePackages: NativePackage[] = [
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
    name: "@legend-apps/secure-storage",
    root: path.join(packagesDir, "secure-storage"),
    platforms: ["macos"],
  },
  {
    name: "@legend-apps/codex",
    root: path.join(packagesDir, "codex"),
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
    root: path.join(rootDir, "apps", "test-kitchen-sink", "node_modules", "react-native-enriched-markdown"),
    platforms: ["macos", "ios", "android"],
  },
  {
    name: "react-native-webview",
    root: path.join(rootDir, "apps", "music", "node_modules", "react-native-webview"),
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
