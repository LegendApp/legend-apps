#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  appIds,
  assertSupportedPlatform,
  getDefaultDevServerPort,
  loadAppPackageMetadata,
  loadAppManifest,
  parseAppCommand,
  rootDir,
  shellDir,
} from "./lib/apps";
import {
  getMacOSAppWrapperName,
  macOSAppTemplateDir,
  macOSProjectName,
  macOSSchemeFileName,
  macOSXcodeProjectName,
} from "./lib/macosShell";
import { ensureMacOSReleaseWorkspace } from "./lib/macosWorkspaces";
import { getActiveNativePackages, getExcludedNativePackages, writeGeneratedConfig } from "./lib/nativeModules";
import {
  getMacOSReleaseBuild,
  getMacOSReleaseVersion,
  getMacOSSparkleFeedUrl,
  getMacOSSparklePublicEdKey,
} from "./lib/release";
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

function verifyMacOSIdentity(manifest: AppManifest, generated: ReturnType<typeof writeGeneratedConfig>) {
  const appWrapperName = getMacOSAppWrapperName(manifest.displayName);
  const appPackage = loadAppPackageMetadata(manifest.id);
  const appVersion = getMacOSReleaseVersion(appPackage);
  const appBuild = getMacOSReleaseBuild(manifest, appPackage);
  const infoPlistPath = generated.macosInfoPlistPath;

  if (!infoPlistPath) {
    throw new Error(`${manifest.id}/macos did not generate an Info.plist`);
  }

  const workspaceDir = ensureMacOSReleaseWorkspace(manifest, generated.configPath);
  const entitlementsPath = path.join(workspaceDir, macOSAppTemplateDir, `${macOSProjectName}.entitlements`);
  const infoPlist = fs.readFileSync(infoPlistPath, "utf8");
  const entitlements = fs.existsSync(entitlementsPath) ? fs.readFileSync(entitlementsPath, "utf8") : "";
  const project = fs.readFileSync(path.join(workspaceDir, macOSXcodeProjectName, "project.pbxproj"), "utf8");
  const scheme = fs.readFileSync(
    path.join(workspaceDir, macOSXcodeProjectName, "xcshareddata", "xcschemes", macOSSchemeFileName),
    "utf8",
  );

  assertContains(infoPlist, "<key>CFBundleDisplayName</key>", `${manifest.id}/macos Info.plist has no display name`);
  assertContains(infoPlist, "<string>$(PRODUCT_NAME)</string>", `${manifest.id}/macos Info.plist display name should follow PRODUCT_NAME`);
  assertContains(infoPlist, "<key>LegendAppId</key>", `${manifest.id}/macos Info.plist has no LegendAppId`);
  assertContains(infoPlist, `<string>${manifest.id}</string>`, `${manifest.id}/macos Info.plist has wrong app id`);
  assertContains(infoPlist, "<key>LegendAppDisplayName</key>", `${manifest.id}/macos Info.plist has no app display name metadata`);
  assertContains(infoPlist, `<string>${manifest.displayName}</string>`, `${manifest.id}/macos Info.plist has wrong app display name metadata`);
  assertContains(
    infoPlist,
    `<key>CFBundleShortVersionString</key>\n\t<string>${appVersion}</string>`,
    `${manifest.id}/macos Info.plist has wrong short version`,
  );
  assertContains(
    infoPlist,
    `<key>CFBundleVersion</key>\n\t<string>${appBuild}</string>`,
    `${manifest.id}/macos Info.plist has wrong build number`,
  );
  if (manifest.release?.macos) {
    assertContains(
      infoPlist,
      `<key>SUFeedURL</key>\n\t<string>${getMacOSSparkleFeedUrl(manifest, "arm")}</string>`,
      `${manifest.id}/macos Info.plist has wrong Sparkle feed URL`,
    );
    assertContains(
      infoPlist,
      `<key>SUPublicEDKey</key>\n\t<string>${getMacOSSparklePublicEdKey(manifest)}</string>`,
      `${manifest.id}/macos Info.plist has wrong Sparkle public key`,
    );
  }
  assertNotContains(
    infoPlist,
    "<key>NSAllowsArbitraryLoads</key>",
    `${manifest.id}/macos release Info.plist should not disable ATS globally`,
  );
  assertNotContains(
    infoPlist,
    "<key>NSAppTransportSecurity</key>",
    `${manifest.id}/macos release Info.plist should not include dev ATS exceptions`,
  );
  assertNotContains(
    entitlements,
    "com.apple.security.app-sandbox",
    `${manifest.id}/macos release entitlements should not enable App Sandbox`,
  );
  assertNotContains(
    entitlements,
    "com.apple.security.files.user-selected.read-only",
    `${manifest.id}/macos release entitlements should not be read-only sandboxed`,
  );
  assertContains(infoPlist, "<key>LegendHostWindowHidden</key>", `${manifest.id}/macos Info.plist has no host window metadata`);
  assertContains(
    infoPlist,
    `<key>LegendHostWindowHidden</key>\n\t${manifest.hostWindow?.macos?.hidden === true ? "<true/>" : "<false/>"}`,
    `${manifest.id}/macos Info.plist has wrong host window metadata`,
  );
  assertContains(
    infoPlist,
    `<key>LegendUseExpoModules</key>\n\t${manifest.expoModules?.macos === false ? "<false/>" : "<true/>"}`,
    `${manifest.id}/macos Info.plist has wrong Expo modules metadata`,
  );
  const startupBackgroundColors = manifest.hostWindow?.macos?.startupBackgroundColors;
  if (startupBackgroundColors) {
    assertContains(
      infoPlist,
      `<key>LegendHostWindowDarkBackgroundColor</key>\n\t<string>${startupBackgroundColors.dark}</string>`,
      `${manifest.id}/macos Info.plist has wrong dark startup background`,
    );
    assertContains(
      infoPlist,
      `<key>LegendHostWindowLightBackgroundColor</key>\n\t<string>${startupBackgroundColors.light}</string>`,
      `${manifest.id}/macos Info.plist has wrong light startup background`,
    );
  }
  for (const scheme of manifest.urlSchemes?.macos ?? []) {
    assertContains(infoPlist, `<string>${scheme}</string>`, `${manifest.id}/macos Info.plist is missing URL scheme ${scheme}`);
  }
  assertContains(
    project,
    `PRODUCT_BUNDLE_IDENTIFIER = "${manifest.bundleIds.macos}";`,
    `${manifest.id}/macos project has wrong bundle id`,
  );
  assertContains(
    project,
    `PRODUCT_NAME = "${manifest.displayName}";`,
    `${manifest.id}/macos project has wrong product name`,
  );
  assertContains(
    project,
    `path = "${appWrapperName}";`,
    `${manifest.id}/macos project has wrong app wrapper path`,
  );
  assertContains(
    project,
    `productName = "${manifest.displayName}";`,
    `${manifest.id}/macos project has wrong product reference name`,
  );
  assertContains(
    scheme,
    `BuildableName = "${appWrapperName}"`,
    `${manifest.id}/macos scheme has wrong app wrapper name`,
  );
}

async function verifyOne(appId: string, platform: Platform) {
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);
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

  if (platform === "macos") {
    verifyMacOSIdentity(manifest, generated);
  }

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
