#!/usr/bin/env bun
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, shellDir } from "./lib/apps";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function prebuildOne(appId: string, platform: Platform, clean: boolean) {
  if (platform === "macos") {
    throw new Error("Expo prebuild only supports ios and android. macos is maintained in shell/macos.");
  }

  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  writeGeneratedConfig(manifest, platform);

  runCommand(
    "bun",
    ["x", "expo", "prebuild", "--platform", platform, ...(clean ? ["--clean"] : [])],
    {
      cwd: shellDir,
      env: {
        LEGEND_APP: appId,
        LEGEND_PLATFORM: platform,
      },
    },
  );
}

async function main() {
  const clean = process.argv.includes("--clean");
  const args = process.argv.slice(2).filter((arg) => arg !== "--clean");
  const command = parseAppCommand(args);

  if (command.all) {
    for (const appId of appIds) {
      for (const platform of ["ios", "android"] as Platform[]) {
        await prebuildOne(appId, platform, clean);
      }
    }
    return;
  }

  await prebuildOne(command.appId, command.platform, clean);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
