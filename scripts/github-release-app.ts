#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertSupportedPlatform,
  loadAppManifest,
  loadAppPackageMetadata,
  rootDir,
} from "./lib/apps";
import {
  getGitHubReleaseTag,
  getMacOSReleaseArchiveName,
  getMacOSReleaseDistDir,
  getMacOSReleaseVersion,
  getReleaseAssetStem,
} from "./lib/release";

type MacOSBuildArch = "arm" | "x86";

type ReleaseOptions = {
  allowDirty: boolean;
  arch: MacOSBuildArch;
  notesFile?: string;
  skipPushTag: boolean;
};

function runCommand(command: string, args: string[], options: { cwd?: string; capture?: boolean } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.capture ? "utf8" : undefined,
    env: process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function parseOptions(args: string[]): ReleaseOptions {
  const options: ReleaseOptions = {
    allowDirty: false,
    arch: "arm",
    skipPushTag: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--arch=arm" || arg === "arm") {
      options.arch = "arm";
    } else if (arg === "--arch=x86" || arg === "x86") {
      options.arch = "x86";
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--skip-push-tag") {
      options.skipPushTag = true;
    } else if (arg === "--notes-file") {
      options.notesFile = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--notes-file=")) {
      options.notesFile = arg.slice("--notes-file=".length);
    } else {
      throw new Error(`Unexpected release option "${arg}".`);
    }
  }

  return options;
}

function assertGitHubCli() {
  runCommand("gh", ["--version"], { capture: true });
}

function assertCleanGitStatus(options: ReleaseOptions) {
  if (options.allowDirty) {
    return;
  }

  const status = runCommand("git", ["status", "--porcelain"], { cwd: rootDir, capture: true }).trim();
  if (status) {
    throw new Error(`Refusing to create a release with uncommitted changes:\n${status}`);
  }
}

function tagExists(tagName: string) {
  const result = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
    cwd: rootDir,
    stdio: "ignore",
  });
  return result.status === 0;
}

function readReleaseNotes(notesFile: string | undefined, fallback: string) {
  if (!notesFile) {
    return fallback;
  }

  const resolvedPath = path.resolve(rootDir, notesFile);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Release notes file does not exist: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, "utf8");
}

function findDeltaFiles(distDir: string, assetStem: string) {
  if (!fs.existsSync(distDir)) {
    return [];
  }

  return fs.readdirSync(distDir)
    .filter((name) => name.startsWith(assetStem) && name.endsWith(".delta"))
    .map((name) => path.join(distDir, name));
}

async function main() {
  const [appId, ...args] = process.argv.slice(2);
  if (!appId) {
    throw new Error("Usage: bun scripts/github-release-app.ts <app> [arm|x86] [--notes-file <path>] [--allow-dirty]");
  }

  const options = parseOptions(args);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, "macos");

  const appPackage = loadAppPackageMetadata(appId);
  const distDir = getMacOSReleaseDistDir(manifest);
  const archivePath = path.join(distDir, getMacOSReleaseArchiveName(manifest, appPackage, options.arch));
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Missing release archive at ${archivePath}. Run bun scripts/package-macos-app.ts ${appId} ${options.arch} first.`);
  }

  assertGitHubCli();
  assertCleanGitStatus(options);

  const tagName = getGitHubReleaseTag(manifest, appPackage);
  if (!tagExists(tagName)) {
    runCommand("git", ["tag", "-a", tagName, "-m", `${manifest.displayName} ${getMacOSReleaseVersion(appPackage)}`], {
      cwd: rootDir,
    });
  }

  if (!options.skipPushTag) {
    runCommand("git", ["push", "origin", tagName], { cwd: rootDir });
  }

  const releaseNotes = readReleaseNotes(
    options.notesFile,
    `${manifest.displayName} ${getMacOSReleaseVersion(appPackage)}`,
  );
  const notesPath = path.join(os.tmpdir(), `${tagName}-notes.md`);
  fs.writeFileSync(notesPath, releaseNotes);

  const deltaFiles = findDeltaFiles(distDir, getReleaseAssetStem(manifest));
  runCommand("gh", [
    "release",
    "create",
    tagName,
    "--title",
    `${manifest.displayName} ${getMacOSReleaseVersion(appPackage)}`,
    "--notes-file",
    notesPath,
    archivePath,
    ...deltaFiles,
  ], { cwd: rootDir });

  console.log(`Created GitHub release ${tagName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

