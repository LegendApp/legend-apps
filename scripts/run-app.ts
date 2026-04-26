#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, rootDir, shellDir } from "./lib/apps";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand, runPlatformCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function prepare(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  writeGeneratedConfig(manifest, platform);
  return manifest;
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

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

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

  if (command.mode === "start") {
    runCommand("bun", ["scripts/start-app.ts", command.appId, command.platform, ...command.extraArgs], {
      cwd: rootDir,
    });
    return;
  }

  await prepare(command.appId, command.platform);
  await ensurePrebuild(command.appId, command.platform);
  runPlatformCommand(command.appId, command.platform, "dev", command.extraArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
