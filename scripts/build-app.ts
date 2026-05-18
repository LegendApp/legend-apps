#!/usr/bin/env bun
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, shellDir } from "./lib/apps";
import {
  ensureMacOSReleaseWorkspace,
  getMacOSReleaseAppRootDir,
  getMacOSEnv,
  installMacOSPods,
} from "./lib/macosWorkspaces";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand, runPlatformCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function buildOne(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform, "release");

  if (platform === "macos") {
    const appRoot = getMacOSReleaseAppRootDir(appId);
    const workspaceDir = ensureMacOSReleaseWorkspace(manifest, generated.configPath);
    installMacOSPods(workspaceDir, generated.configPath, appId, appRoot);
    runCommand(
      "xcodebuild",
      [
        "-workspace",
        `${workspaceDir}/legendapp-shell-macos.xcworkspace`,
        "-scheme",
        "legendapp-shell-macos",
        "-configuration",
        "Release",
        "-derivedDataPath",
        `${workspaceDir}/build/xcodebuild-release`,
      ],
      {
        cwd: shellDir,
        env: {
          ...getMacOSEnv(appId, generated.configPath, appRoot),
          LEGEND_MACOS_INFOPLIST_FILE: generated.macosInfoPlistPath,
        },
      },
    );
    return;
  }

  runPlatformCommand(appId, platform, "release", [], {
    LEGEND_APP_CONFIG: generated.configPath,
    LEGEND_NATIVE_CONFIG: generated.configPath,
  });
}

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

  if (command.all) {
    for (const appId of appIds) {
      for (const platform of ["macos", "ios", "android"] as Platform[]) {
        await buildOne(appId, platform);
      }
    }
    return;
  }

  await buildOne(command.appId, command.platform);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
