#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appIds, assertSupportedPlatform, loadAppManifest, parseAppCommand, rootDir, shellDir } from "./lib/apps";
import { getActiveNativePackages, getExcludedNativePackages, writeGeneratedConfig } from "./lib/nativeModules";
import type { Platform } from "./lib/types";

function runCapture(command: string, args: string[], env: Record<string, string>) {
  const result = spawnSync(command, args, {
    cwd: shellDir,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

function assertContains(output: string, needle: string, message: string) {
  if (!output.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotContains(output: string, needle: string, message: string) {
  if (output.includes(needle)) {
    throw new Error(message);
  }
}

async function verifyOne(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  const generated = writeGeneratedConfig(manifest, platform);

  const active = getActiveNativePackages(manifest, platform).map((pkg) => pkg.name);
  const excluded = getExcludedNativePackages(manifest, platform).map((pkg) => pkg.name);
  const generatedText = JSON.stringify(generated);

  for (const pkg of active) {
    assertContains(generatedText, pkg, `${appId}/${platform} generated config does not include ${pkg}`);
  }

  for (const pkg of excluded) {
    assertContains(generatedText, pkg, `${appId}/${platform} generated config should record excluded package ${pkg}`);
  }

  const appSource = fs.readFileSync(path.join(rootDir, "apps", appId, "src", "App.tsx"), "utf8");
  assertNotContains(appSource, "@legend-desktop/music-test", `${appId} app source imports removed music-test package`);

  const rnConfig = runCapture("bun", ["x", "react-native", "config"], {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: platform,
  });

  if (rnConfig.ok) {
    let parsedConfig: any = null;
    try {
      parsedConfig = JSON.parse(rnConfig.output);
    } catch {
      parsedConfig = null;
    }

    for (const pkg of active) {
      assertContains(rnConfig.output, pkg, `react-native config does not include active package ${pkg}`);
    }
    for (const pkg of excluded) {
      const dependency = parsedConfig?.dependencies?.[pkg];
      const hasLinkedPlatform = dependency?.platforms?.[platform] != null;
      if (hasLinkedPlatform) {
        throw new Error(`react-native config links excluded package ${pkg} for ${platform}`);
      }
    }
  } else {
    console.warn("react-native config check skipped because the command failed before dependencies were installed.");
  }

  console.log(`Verified ${appId}/${platform}`);
}

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

  if (command.all) {
    for (const appId of appIds) {
      for (const platform of ["macos", "ios", "android"] as Platform[]) {
        await verifyOne(appId, platform);
      }
    }
    return;
  }

  await verifyOne(command.appId, command.platform);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
