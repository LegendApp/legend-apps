#!/usr/bin/env bun
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand } from "./lib/apps";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runPlatformCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function buildOne(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  writeGeneratedConfig(manifest, platform);
  runPlatformCommand(appId, platform, "release");
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
