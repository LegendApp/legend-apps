#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, shellDir } from "./lib/apps";
import {
  ensureMacOSReleaseWorkspace,
  getMacOSReleaseAppRootDir,
  getMacOSReleaseDerivedDataPath,
  getMacOSEnv,
  installMacOSPods,
} from "./lib/macosWorkspaces";
import { getMacOSAppWrapperName, macOSSchemeName, macOSWorkspaceName } from "./lib/macosShell";
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

function getExistingCodeSignIdentity(appPath: string) {
  const result = spawnSync("codesign", ["-dvv", appPath], {
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`;

  if (result.status !== 0) {
    throw new Error(`Failed to inspect code signature for ${appPath}:\n${output}`);
  }

  return output.includes("Signature=adhoc")
    ? "-"
    : output.match(/^Authority=(.+)$/m)?.[1] ?? "-";
}

function stripMacOSHermesSymbols(appPath: string) {
  const hermesFrameworkPath = path.join(appPath, "Contents", "Frameworks", "hermes.framework");
  const hermesBinaryPath = path.join(hermesFrameworkPath, "Versions", "Current", "hermes");

  if (fs.existsSync(hermesBinaryPath)) {
    const signIdentity = getExistingCodeSignIdentity(appPath);

    console.log(`Stripping Hermes symbols at ${hermesBinaryPath}`);
    runCommand("strip", ["-S", "-x", hermesBinaryPath]);
    runCommand("codesign", [
      "--force",
      "--sign",
      signIdentity,
      "--preserve-metadata=identifier,entitlements,flags,runtime",
      hermesFrameworkPath,
    ]);
    signMacOSApp(appPath, signIdentity);
  }
}

function signMacOSApp(appPath: string, signIdentity: string) {
  runCommand("codesign", [
    "--force",
    "--sign",
    signIdentity,
    "--preserve-metadata=identifier,entitlements,flags,runtime",
    appPath,
  ]);
}

function copyMissingMacOSMetroAssets(appPath: string) {
  const assetsDirName = "assets";
  const sourceAssetsPath = path.join(appPath, "Contents", "Resources", assetsDirName);

  if (!fs.existsSync(sourceAssetsPath)) {
    return;
  }

  const productsDir = path.dirname(appPath);
  const nestedAppPath = path.join(productsDir, path.basename(appPath, ".app"), path.basename(appPath));
  const nestedAssetsPath = path.join(nestedAppPath, "Contents", "Resources", assetsDirName);

  if (nestedAppPath === appPath || !fs.existsSync(nestedAppPath)) {
    return;
  }

  console.log(`Copying Metro assets to ${nestedAssetsPath}`);
  fs.cpSync(sourceAssetsPath, nestedAssetsPath, { force: true, recursive: true });
  signMacOSApp(nestedAppPath, getExistingCodeSignIdentity(appPath));
}

async function buildOne(appId: string, platform: Platform, args: string[] = []) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform, "release");

  if (platform === "macos") {
    const arch = parseMacOSBuildArch(args);
    const appRoot = getMacOSReleaseAppRootDir(appId);
    const workspaceDir = ensureMacOSReleaseWorkspace(manifest, generated.configPath);
    const derivedDataPath = getMacOSReleaseDerivedDataPath(workspaceDir, arch);
    const appPath = path.join(derivedDataPath, "Build", "Products", "Release", getMacOSAppWrapperName(manifest.displayName));

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
        derivedDataPath,
        `ARCHS=${getXcodeArch(arch)}`,
        "ONLY_ACTIVE_ARCH=NO",
        "DEPLOYMENT_POSTPROCESSING=YES",
      ],
      {
        cwd: shellDir,
        env: {
          ...getMacOSEnv(appId, generated.configPath, appRoot),
          LEGEND_MACOS_INFOPLIST_FILE: generated.macosInfoPlistPath,
        },
      },
    );
    copyMissingMacOSMetroAssets(appPath);
    stripMacOSHermesSymbols(appPath);
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
