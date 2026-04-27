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
    name: "@legend-desktop/music-test",
    root: path.join(packagesDir, "music-test"),
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
