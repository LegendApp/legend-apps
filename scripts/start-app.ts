#!/usr/bin/env bun
import { assertSupportedPlatform, loadAppManifest, parseAppCommand, shellDir } from "./lib/apps";
import { writeGeneratedConfig } from "./lib/nativeModules";
import { runCommand } from "./lib/run";
import type { Platform } from "./lib/types";

async function startOne(appId: string, platform: Platform, extraArgs: string[]) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform, "dev");

  const env = {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: platform,
    LEGEND_APP_CONFIG: generated.configPath,
    LEGEND_NATIVE_CONFIG: generated.configPath,
  };

  if (platform === "macos") {
    runCommand("bun", ["x", "react-native", "start", ...extraArgs], {
      cwd: shellDir,
      env,
    });
  } else {
    runCommand("bun", ["x", "expo", "start", "--dev-client", ...extraArgs], {
      cwd: shellDir,
      env,
    });
  }
}

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

  if (command.all) {
    throw new Error("Starting all dev servers is not supported. Start one app/platform at a time.");
  }

  await startOne(command.appId, command.platform, command.extraArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
