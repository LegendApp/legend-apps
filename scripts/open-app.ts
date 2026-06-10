#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertSupportedPlatform, loadAppManifest, shellDir } from "./lib/apps";
import { parseAppCommand } from "./lib/apps";
import { splitLaunchArgs, type OptionSpecs } from "./lib/launchArgs";
import { ensureMacOSDevWorkspace, getMacOSReleaseWorkspaceDir } from "./lib/macosWorkspaces";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand } from "./lib/run";
import type { Platform } from "./lib/types";

const macosScheme = "legendapp-shell-macos";
const openOptionSpecs: OptionSpecs = {
  "--configuration": "value",
  "--mode": "value",
  "--print": "boolean",
  "--release": "boolean",
};

function readMode(args: string[]) {
  if (args.includes("--release")) {
    return "Release";
  }

  const modeIndex = args.findIndex((arg) => arg === "--mode" || arg === "--configuration");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : undefined;
  return mode === "Release" ? "Release" : "Debug";
}

function shouldPrintOnly(args: string[]) {
  return args.includes("--print");
}

function parseBuildSettings(output: string) {
  const jsonStart = output.indexOf("[");
  if (jsonStart < 0) {
    throw new Error("Could not parse xcodebuild settings output.");
  }

  return JSON.parse(output.slice(jsonStart)) as Array<{
    buildSettings?: Record<string, string | undefined>;
  }>;
}

function getBuiltMacAppPath(workspaceDir: string, mode: string) {
  const macosWorkspace = path.join(workspaceDir, "legendapp-shell-macos.xcworkspace");
  const result = spawnSync(
    "xcodebuild",
    [
      "-workspace",
      macosWorkspace,
      "-scheme",
      macosScheme,
      "-configuration",
      mode,
      "-showBuildSettings",
      "-json",
    ],
    {
      cwd: shellDir,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to read macOS build settings.");
  }

  const targets = parseBuildSettings(result.stdout);
  const appSettings = targets
    .map((target) => target.buildSettings)
    .find((settings) => settings?.WRAPPER_NAME?.endsWith(".app") || settings?.FULL_PRODUCT_NAME?.endsWith(".app"));

  const productsDir = appSettings?.BUILT_PRODUCTS_DIR;
  const wrapperName = appSettings?.WRAPPER_NAME ?? appSettings?.FULL_PRODUCT_NAME;

  if (!productsDir || !wrapperName) {
    throw new Error("Could not find the built macOS app path in Xcode build settings.");
  }

  return path.join(productsDir, wrapperName);
}

async function openOne(appId: string, platform: Platform, args: string[]) {
  if (platform !== "macos") {
    throw new Error("Opening an already built app is currently implemented for macos only.");
  }

  const { launchArgs, runnerArgs } = splitLaunchArgs(args, openOptionSpecs);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);

  const mode = readMode(runnerArgs);
  const graphMode = mode === "Release" ? "release" : "dev";
  writeGeneratedConfig(manifest, platform, graphMode);
  const workspaceDir = mode === "Release" ? getMacOSReleaseWorkspaceDir(appId) : ensureMacOSDevWorkspace(manifest);

  const appPath = getBuiltMacAppPath(workspaceDir, mode);

  if (!fs.existsSync(appPath)) {
    throw new Error(`No built macOS app found at ${appPath}. Run bun run ${appId} macos first.`);
  }

  if (shouldPrintOnly(runnerArgs)) {
    console.log(appPath);
    return;
  }

  runCommand("open", launchArgs.length > 0 ? ["-n", appPath, "--args", ...launchArgs] : [appPath]);
}

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

  if (command.all) {
    throw new Error("Opening all apps is not supported. Open one app/platform at a time.");
  }

  await openOne(command.appId, command.platform, command.extraArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
