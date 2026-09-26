#!/usr/bin/env bun
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { sparkConfig, sparkCheckout } from "./lib/sparkWorkspaces";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  appIds,
  assertSupportedPlatform,
  getDefaultDevServerPort,
  loadAppManifest,
  parseAppCommand,
  rootDir,
  shellDir,
} from "./lib/apps";
import { getActiveNativePackages, getExcludedNativePackages, writeGeneratedConfig } from "./lib/nativeModules";
import type { AppManifest, Platform } from "./lib/types";

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

function assertUniqueValue(label: string, owner: string, value: string, seen: Map<string, string>) {
  const existingOwner = seen.get(value);
  if (existingOwner) {
    throw new Error(`${label} "${value}" is used by both ${existingOwner} and ${owner}`);
  }
  seen.set(value, owner);
}

async function verifyManifestUniqueness() {
  const manifests = await Promise.all(appIds.map((appId) => loadAppManifest(appId)));
  const checks: Array<{
    label: string;
    value: (manifest: AppManifest) => string;
  }> = [
    { label: "app id", value: (manifest) => manifest.id },
    { label: "display name", value: (manifest) => manifest.displayName },
    { label: "iOS bundle id", value: (manifest) => manifest.bundleIds.ios },
    { label: "macOS bundle id", value: (manifest) => manifest.bundleIds.macos },
    { label: "Android package", value: (manifest) => manifest.androidPackage },
    { label: "Metro port", value: (manifest) => String(getDefaultDevServerPort(manifest.id)) },
  ];

  for (const check of checks) {
    const seen = new Map<string, string>();
    for (const manifest of manifests) {
      assertUniqueValue(check.label, manifest.id, check.value(manifest), seen);
    }
  }
}

function verifySpark(manifest: AppManifest) {
  const config = sparkConfig(manifest);
  const require = createRequire(import.meta.url);
  const { toExpo } = require(path.join(sparkCheckout, "packages/config-plugin/config.cjs"));
  const { identity } = require(path.join(sparkCheckout, "packages/config-plugin/identity.cjs"));
  const nativeIdentity = identity(toExpo(config).expo);
  assert.equal(nativeIdentity.SparkProjectIdentifier, manifest.bundleIds.macos);
  assert.deepEqual(nativeIdentity.SparkLifecycleConfiguration, config.macos.lifecycle);
  const sdkRoot = fs.realpathSync(path.join(rootDir, "node_modules/@legendapp/spark"));
  const modules = new Map<string, string>();
  for (const pkg of getActiveNativePackages(manifest, "macos")) {
    assert.ok(!config.expo.autolinking.exclude.includes(pkg.name), `${pkg.name} is both included and excluded`);
    const packageRoot = pkg.name.startsWith("@legendapp/spark-")
      ? path.join(sdkRoot, "vendor/node_modules", pkg.name) : pkg.root;
    const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.ok(fs.readdirSync(packageRoot).some(file => file.endsWith(".podspec")) || metadata.codegenConfig || fs.existsSync(path.join(packageRoot, "expo-module.config.json")), `${pkg.name} has no native integration`);
    for (const name of Object.keys(metadata.codegenConfig?.ios?.modulesProvider ?? {})) {
      assert.ok(!modules.has(name), `${name} has duplicate native providers in ${modules.get(name)} and ${pkg.name}`);
      modules.set(name, pkg.name);
    }
  }
  console.log(`Verified ${manifest.id}/macos Spark identity and native package graph`);
}

async function verifyOne(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
  if (platform === "macos") { verifySpark(manifest); return; }
  const generated = writeGeneratedConfig(manifest, platform, "release");

  const active = getActiveNativePackages(manifest, platform).map((pkg) => pkg.name);
  const excluded = getExcludedNativePackages(manifest, platform).map((pkg) => pkg.name);
  const generatedText = JSON.stringify(generated.config);

  for (const pkg of active) {
    assertContains(generatedText, pkg, `${appId}/${platform} generated config does not include ${pkg}`);
  }

  for (const pkg of excluded) {
    assertContains(generatedText, pkg, `${appId}/${platform} generated config should record excluded package ${pkg}`);
  }

  const appSource = fs.readFileSync(path.join(rootDir, "apps", appId, "src", "App.tsx"), "utf8");
  assertNotContains(appSource, "@legend-apps/music-test", `${appId} app source imports removed music-test package`);


  const rnConfig = runCapture("bun", ["x", "react-native", "config"], {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: platform,
    LEGEND_APP_CONFIG: generated.configPath,
    LEGEND_NATIVE_CONFIG: generated.configPath,
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
  await verifyManifestUniqueness();

  if (command.all) {
    for (const appId of appIds) {
      const manifest = await loadAppManifest(appId);
      for (const platform of manifest.platforms) {
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
