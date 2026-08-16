import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getMacOSReleaseBuild, getMacOSReleaseVersion, getMacOSSparkleFeedUrl } from "./release";
import type { AppManifest, AppPackageMetadata, MacOSReleaseArch } from "./types";

type ValidateMacOSReleaseAppOptions = {
  appPackage: AppPackageMetadata;
  appPath: string;
  arch: MacOSReleaseArch;
  manifest: AppManifest;
};

function runTool(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
    stdio: "pipe",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed${output ? `:\n${output}` : "."}`);
  }
  return output;
}

function readPlistValue(infoPlistPath: string, key: string) {
  return runTool("plutil", ["-extract", key, "raw", "-o", "-", infoPlistPath]);
}

function assertValue(label: string, actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`);
  }
}

export function validateMacOSReleaseApp({
  appPackage,
  appPath,
  arch,
  manifest,
}: ValidateMacOSReleaseAppOptions) {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPlistPath)) {
    throw new Error(`Release app has no Info.plist: ${appPath}`);
  }

  const executableName = readPlistValue(infoPlistPath, "CFBundleExecutable");
  const executablePath = path.join(appPath, "Contents", "MacOS", executableName);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Release app executable is missing: ${executablePath}`);
  }

  const architectures = runTool("lipo", ["-archs", executablePath]).split(/\s+/);
  const expectedArchitecture = arch === "arm" ? "arm64" : "x86_64";
  if (!architectures.includes(expectedArchitecture)) {
    throw new Error(`Release app has architectures ${architectures.join(", ")}; expected ${expectedArchitecture}.`);
  }

  runTool("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const signature = runTool("codesign", ["-dvvv", appPath]);
  if (!/^Authority=Developer ID Application:/m.test(signature)) {
    throw new Error(`Release app is not signed with a Developer ID Application certificate:\n${signature}`);
  }
  if (!/^TeamIdentifier=(?!not set$).+/m.test(signature)) {
    throw new Error(`Release app has no signing team identifier:\n${signature}`);
  }
  if (!/^CodeDirectory .*\(runtime\)/m.test(signature)) {
    throw new Error(`Release app is not signed with the hardened runtime:\n${signature}`);
  }

  runTool("xcrun", ["stapler", "validate", appPath]);
  runTool("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);

  assertValue("CFBundleIdentifier", readPlistValue(infoPlistPath, "CFBundleIdentifier"), manifest.bundleIds.macos);
  assertValue("CFBundleShortVersionString", readPlistValue(infoPlistPath, "CFBundleShortVersionString"), getMacOSReleaseVersion(appPackage));
  assertValue("CFBundleVersion", readPlistValue(infoPlistPath, "CFBundleVersion"), getMacOSReleaseBuild(manifest, appPackage));
  assertValue("SUFeedURL", readPlistValue(infoPlistPath, "SUFeedURL"), getMacOSSparkleFeedUrl(manifest, arch));
}

export function validateMacOSReleaseArchive({
  appPackage,
  archivePath,
  arch,
  manifest,
}: Omit<ValidateMacOSReleaseAppOptions, "appPath"> & { archivePath: string }) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `${manifest.id}-release-validation-`));
  try {
    runTool("ditto", ["-x", "-k", archivePath, temporaryDirectory]);
    const appNames = fs.readdirSync(temporaryDirectory).filter((name) => name.endsWith(".app"));
    if (appNames.length !== 1) {
      throw new Error(`Release archive must contain exactly one top-level app; found ${appNames.length}.`);
    }
    validateMacOSReleaseApp({
      appPackage,
      appPath: path.join(temporaryDirectory, appNames[0]),
      arch,
      manifest,
    });
  } finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}
