#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import {
  appIds,
  assertSupportedPlatform,
  formatAppUsage,
  loadAppManifest,
  parseAppCommand,
  rootDir,
  shellDir,
} from "./lib/apps";
import {
  getMacOSDevWorkspaceDir,
  installMacOSPods,
} from "./lib/macosWorkspaces";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand, runPlatformCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function prepare(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform, "dev");
  return { generated, manifest };
}

async function ensurePrebuild(appId: string, platform: Platform) {
  if (platform === "macos") {
    return;
  }

  const nativeDir = path.join(shellDir, platform === "ios" ? "ios" : "android");
  if (!fs.existsSync(nativeDir)) {
    runCommand("bun", ["scripts/prebuild-app.ts", appId, platform], {
      cwd: rootDir,
    });
  }
}

async function installPods(appId: string, platform: Platform) {
  if (platform === "android") {
    throw new Error("CocoaPods install only supports macos and ios.");
  }

  const { generated } = await prepare(appId, platform);

  if (platform === "macos") {
    installMacOSPods(getMacOSDevWorkspaceDir(), generated.configPath, appId);
    return;
  }

  runCommand("pod", ["install"], {
    cwd: path.join(shellDir, platform),
    env: {
      LEGEND_APP: appId,
      LEGEND_PLATFORM: platform,
      LEGEND_APP_CONFIG: generated.configPath,
      LEGEND_NATIVE_CONFIG: generated.configPath,
    },
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 1 && args[0] !== "--all") {
    console.log(formatAppUsage(args[0]));
    return;
  }

  const command = parseAppCommand(args);

  if (command.all) {
    for (const appId of appIds) {
      for (const platform of ["macos", "ios", "android"] as Platform[]) {
        await prepare(appId, platform);
      }
    }
    return;
  }

  if (command.mode === "build") {
    runCommand("bun", ["scripts/build-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  if (command.mode === "prebuild") {
    runCommand("bun", ["scripts/prebuild-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  if (command.mode === "verify") {
    runCommand("bun", ["scripts/verify-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  if (command.mode === "pods") {
    await installPods(command.appId, command.platform);
    return;
  }

  if (command.mode === "start") {
    runCommand("bun", ["scripts/start-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  if (command.mode === "open") {
    runCommand("bun", ["scripts/open-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  const { generated } = await prepare(command.appId, command.platform);
  await ensurePrebuild(command.appId, command.platform);
  runPlatformCommand(command.appId, command.platform, "dev", command.extraArgs, {
    LEGEND_APP_CONFIG: generated.configPath,
    LEGEND_NATIVE_CONFIG: generated.configPath,
    LEGEND_SHELL_ROOT: shellDir,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
