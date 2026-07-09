#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  assertSupportedPlatform,
  loadAppManifest,
  loadAppPackageMetadata,
  rootDir,
  shellDir,
} from "./lib/apps";
import { getMacOSAppWrapperName, macOSAppTemplateDir, macOSProjectName } from "./lib/macosShell";
import {
  getMacOSReleaseDerivedDataPath,
  getMacOSReleaseWorkspaceDir,
} from "./lib/macosWorkspaces";
import {
  getGitHubReleaseDownloadUrlPrefix,
  getMacOSReleaseArchiveName,
  getMacOSReleaseDistDir,
  getMacOSSparkleAppcastPath,
} from "./lib/release";
import { validateMacOSReleaseApp } from "./lib/macosReleaseValidation";

type MacOSBuildArch = "arm" | "x86";
type MacOSPackageArch = MacOSBuildArch | "all";

type PackageOptions = {
  arch: MacOSPackageArch;
  skipAppcast: boolean;
  skipBuild: boolean;
  skipNotarize: boolean;
  skipSign: boolean;
};

function runCommand(command: string, args: string[], options: { cwd?: string } = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseOptions(args: string[]): PackageOptions {
  const options: PackageOptions = {
    arch: "arm",
    skipAppcast: false,
    skipBuild: false,
    skipNotarize: false,
    skipSign: false,
  };

  for (const arg of args) {
    if (arg === "--arch=arm" || arg === "arm") {
      options.arch = "arm";
    } else if (arg === "--arch=x86" || arg === "x86") {
      options.arch = "x86";
    } else if (arg === "--arch=all" || arg === "all") {
      options.arch = "all";
    } else if (arg === "--skip-appcast") {
      options.skipAppcast = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--skip-notarize") {
      options.skipNotarize = true;
    } else if (arg === "--skip-sign") {
      options.skipSign = true;
    } else {
      throw new Error(`Unexpected package option "${arg}".`);
    }
  }

  return options;
}

function getPackageArchitectures(arch: MacOSPackageArch): MacOSBuildArch[] {
  return arch === "all" ? ["arm", "x86"] : [arch];
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]] != null) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function getDeveloperIdApplicationIdentity() {
  const explicitIdentity = process.env.LEGEND_DEVELOPER_ID_APPLICATION;
  if (explicitIdentity) {
    return explicitIdentity;
  }

  const teamName = process.env.LEGEND_TEAM_NAME;
  const teamId = process.env.LEGEND_TEAM_ID;
  if (teamName && teamId) {
    return `Developer ID Application: ${teamName} (${teamId})`;
  }

  throw new Error(
    "Missing Developer ID signing identity. Set LEGEND_DEVELOPER_ID_APPLICATION, or set LEGEND_TEAM_NAME and LEGEND_TEAM_ID.",
  );
}

function signApp(appPath: string, entitlementsPath: string, options: PackageOptions) {
  if (options.skipSign) {
    console.warn("Skipping Developer ID signing because --skip-sign was passed.");
    return;
  }

  const identity = getDeveloperIdApplicationIdentity();
  const args = [
    "--force",
    "--deep",
    "--sign",
    identity,
    "--options",
    "runtime",
  ];

  if (fs.existsSync(entitlementsPath)) {
    args.push("--entitlements", entitlementsPath);
  }

  runCommand("codesign", [...args, appPath]);
}

function notarizeApp(appPath: string, safeAppName: string, options: PackageOptions) {
  if (options.skipNotarize) {
    console.warn("Skipping notarization because --skip-notarize was passed.");
    return;
  }

  const notaryZipPath = path.join("/tmp", `${safeAppName}-notarize.zip`);
  fs.rmSync(notaryZipPath, { force: true });
  runCommand("ditto", ["-c", "-k", "--keepParent", appPath, notaryZipPath]);

  const keychainProfile = process.env.LEGEND_NOTARY_KEYCHAIN_PROFILE;
  if (keychainProfile) {
    runCommand("xcrun", [
      "notarytool",
      "submit",
      notaryZipPath,
      "--keychain-profile",
      keychainProfile,
      "--wait",
    ]);
  } else {
    const appleId = process.env.LEGEND_APPLE_ID;
    const appPassword = process.env.LEGEND_APP_PASSWORD;
    const teamId = process.env.LEGEND_TEAM_ID;
    if (!appleId || !appPassword || !teamId) {
      throw new Error(
        "Missing notarization credentials. Set LEGEND_NOTARY_KEYCHAIN_PROFILE, or set LEGEND_APPLE_ID, LEGEND_APP_PASSWORD, and LEGEND_TEAM_ID.",
      );
    }

    runCommand("xcrun", [
      "notarytool",
      "submit",
      notaryZipPath,
      "--apple-id",
      appleId,
      "--password",
      appPassword,
      "--team-id",
      teamId,
      "--wait",
    ]);
  }

  runCommand("xcrun", ["stapler", "staple", appPath]);
}

function getGenerateAppcastPath(appId: string) {
  const workspaceToolPath = path.join(
    getMacOSReleaseWorkspaceDir(appId),
    "Pods",
    "Sparkle",
    "bin",
    "generate_appcast",
  );
  const sharedToolPath = path.join(shellDir, "macos", "Pods", "Sparkle", "bin", "generate_appcast");

  if (fs.existsSync(workspaceToolPath)) {
    return workspaceToolPath;
  }

  if (fs.existsSync(sharedToolPath)) {
    return sharedToolPath;
  }

  throw new Error(`Could not find Sparkle generate_appcast at ${workspaceToolPath} or ${sharedToolPath}.`);
}

function packageArchitecture(
  appId: string,
  manifest: Awaited<ReturnType<typeof loadAppManifest>>,
  appPackage: ReturnType<typeof loadAppPackageMetadata>,
  options: PackageOptions,
  arch: MacOSBuildArch,
) {
  if (!options.skipBuild) {
    runCommand("bun", ["scripts/build-app.ts", appId, "macos", arch], { cwd: rootDir });
  }

  const workspaceDir = getMacOSReleaseWorkspaceDir(appId);
  const derivedDataPath = getMacOSReleaseDerivedDataPath(workspaceDir, arch);
  const appWrapperName = getMacOSAppWrapperName(manifest.displayName);
  const builtAppPath = path.join(derivedDataPath, "Build", "Products", "Release", appWrapperName);
  if (!fs.existsSync(builtAppPath)) {
    throw new Error(`Missing built app at ${builtAppPath}. Run bun scripts/build-app.ts ${appId} macos ${arch}.`);
  }

  const distDir = getMacOSReleaseDistDir(manifest);
  const distAppPath = path.join(distDir, appWrapperName);
  const archiveName = getMacOSReleaseArchiveName(manifest, appPackage, arch);
  const archivePath = path.join(distDir, archiveName);
  const entitlementsPath = path.join(workspaceDir, macOSAppTemplateDir, `${macOSProjectName}.entitlements`);

  fs.mkdirSync(distDir, { recursive: true });
  fs.rmSync(distAppPath, { recursive: true, force: true });
  fs.cpSync(builtAppPath, distAppPath, { recursive: true });

  signApp(distAppPath, entitlementsPath, options);
  notarizeApp(distAppPath, `${manifest.id}-${arch}`, options);
  if (!options.skipSign && !options.skipNotarize) {
    validateMacOSReleaseApp({
      appPackage,
      appPath: distAppPath,
      arch,
      manifest,
    });
  }

  fs.rmSync(archivePath, { force: true });
  runCommand("ditto", [
    "-ck",
    "-rsrc",
    "--sequesterRsrc",
    "--keepParent",
    distAppPath,
    archivePath,
  ]);

  console.log(`Packaged ${manifest.displayName} ${arch} at ${archivePath}`);
}

async function main() {
  const [appId, ...args] = process.argv.slice(2);
  if (!appId) {
    throw new Error("Usage: bun scripts/package-macos-app.ts <app> [arm|x86|all] [--skip-build] [--skip-sign] [--skip-notarize]");
  }

  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));

  const options = parseOptions(args);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, "macos");

  if (!manifest.release?.macos) {
    throw new Error(`${manifest.id}/macos must define release metadata before packaging.`);
  }

  const appPackage = loadAppPackageMetadata(appId);
  for (const arch of getPackageArchitectures(options.arch)) {
    packageArchitecture(appId, manifest, appPackage, options, arch);
  }

  if (!options.skipAppcast) {
    const distDir = getMacOSReleaseDistDir(manifest);
    const appcastPath = getMacOSSparkleAppcastPath(manifest);
    const distAppcastPath = path.join(distDir, "appcast.xml");
    if (fs.existsSync(appcastPath)) {
      fs.copyFileSync(appcastPath, distAppcastPath);
    }

    runCommand(getGenerateAppcastPath(appId), [
      distDir,
      "--account",
      "LegendApp",
      "--download-url-prefix",
      getGitHubReleaseDownloadUrlPrefix(manifest, appPackage),
    ]);

    fs.mkdirSync(path.dirname(appcastPath), { recursive: true });
    fs.copyFileSync(distAppcastPath, appcastPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
