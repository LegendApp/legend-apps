#!/usr/bin/env bun
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, shellDir } from "./lib/apps";
import {
  ensureMacOSReleaseWorkspace,
  getMacOSReleaseAppRootDir,
  getMacOSEnv,
  installMacOSPods,
} from "./lib/macosWorkspaces";
import { macOSSchemeName, macOSWorkspaceName } from "./lib/macosShell";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand, runPlatformCommand } from "./lib/run";
import type { Platform } from "./lib/types";

type MacOSBuildArch = "arm" | "x86";

function parseMacOSBuildArch(args: string[]) {
  const arch = args[0] ?? "arm";

  if (arch !== "arm" && arch !== "x86") {
    throw new Error(`Invalid macOS build architecture "${arch}". Expected "arm" or "x86".`);
  }

  if (args.length > 1) {
    throw new Error(`Unexpected build arguments: ${args.slice(1).join(" ")}`);
  }

  return arch;
}

function getXcodeArch(arch: MacOSBuildArch) {
  return arch === "arm" ? "arm64" : "x86_64";
}

async function buildOne(appId: string, platform: Platform, args: string[] = []) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform, "release");

  if (platform === "macos") {
    const arch = parseMacOSBuildArch(args);
    const appRoot = getMacOSReleaseAppRootDir(appId);
    const workspaceDir = ensureMacOSReleaseWorkspace(manifest, generated.configPath);
    installMacOSPods(workspaceDir, generated.configPath, appId, appRoot);
    runCommand(
      "xcodebuild",
      [
        "-workspace",
        `${workspaceDir}/${macOSWorkspaceName}`,
        "-scheme",
        macOSSchemeName,
        "-configuration",
        "Release",
        "-derivedDataPath",
        `${workspaceDir}/build/xcodebuild-release-${arch}`,
        `ARCHS=${getXcodeArch(arch)}`,
        "ONLY_ACTIVE_ARCH=NO",
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

  if (args.length > 0) {
    throw new Error(`Unexpected build arguments for ${platform}: ${args.join(" ")}`);
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

  await buildOne(command.appId, command.platform, command.extraArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
