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
import { ensureAppChangelogEntry } from "./lib/changelog";
import {
  getGitHubReleaseTag,
  getMacOSReleaseArchiveName,
  getMacOSReleaseDistDir,
  getMacOSSparkleAppcastPath,
  getMacOSReleaseVersion,
  getReleaseAssetStem,
} from "./lib/release";

type MacOSBuildArch = "arm" | "x86";
type MacOSReleaseArch = MacOSBuildArch | "all";

type ReleaseOptions = {
  allowDirty: boolean;
  arch: MacOSReleaseArch;
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
    } else if (arg === "--arch=all" || arg === "all") {
      options.arch = "all";
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

function getReleaseArchitectures(arch: MacOSReleaseArch): MacOSBuildArch[] {
  return arch === "all" ? ["arm", "x86"] : [arch];
}

function assertGitHubCli() {
  runCommand("gh", ["--version"], { capture: true });
}

function assertGitHubAuth() {
  runCommand("gh", ["auth", "status"], { capture: true });
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

function fetchTags() {
  runCommand("git", ["fetch", "--tags", "origin"], { cwd: rootDir, capture: true });
}

function tagExists(tagName: string) {
  const result = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
    cwd: rootDir,
    stdio: "ignore",
  });
  return result.status === 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareVersions(a: string, b: string) {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function getReleasedVersions(appId: string) {
  const output = runCommand("git", [
    "for-each-ref",
    "--format=%(refname:short)",
    `refs/tags/${appId}-v*`,
  ], { cwd: rootDir, capture: true }).trim();
  const tagRegex = new RegExp(`^${escapeRegExp(appId)}-v(\\d+(?:\\.\\d+){0,2})$`);
  return output
    .split("\n")
    .map((tag) => tag.match(tagRegex)?.[1])
    .filter((version): version is string => Boolean(version))
    .sort(compareVersions);
}

function getLatestReleasedVersion(appId: string) {
  const versions = getReleasedVersions(appId);
  return versions[versions.length - 1];
}

function assertStableReleaseVersion(appPackage: ReturnType<typeof loadAppPackageMetadata>) {
  const releaseVersion = getMacOSReleaseVersion(appPackage);
  if (appPackage.version !== releaseVersion) {
    throw new Error(`App package version "${appPackage.version}" is not a stable release version.`);
  }
}

function assertVersionIncremented(manifest: Awaited<ReturnType<typeof loadAppManifest>>, appPackage: ReturnType<typeof loadAppPackageMetadata>) {
  const currentVersion = getMacOSReleaseVersion(appPackage);
  const latestVersion = getLatestReleasedVersion(manifest.id);
  if (latestVersion && compareVersions(currentVersion, latestVersion) <= 0) {
    throw new Error(
      `${manifest.id} version ${currentVersion} is not newer than the latest released version ${latestVersion}.`,
    );
  }
}

function assertTagIsNew(tagName: string) {
  if (tagExists(tagName)) {
    throw new Error(`Release tag ${tagName} already exists. Increment the app version before releasing.`);
  }
}

function githubReleaseExists(tagName: string) {
  const result = spawnSync("gh", ["release", "view", tagName], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    stdio: "pipe",
  });
  return result.status === 0;
}

function assertGitHubReleaseIsNew(tagName: string) {
  if (githubReleaseExists(tagName)) {
    throw new Error(`GitHub release ${tagName} already exists. Increment the app version before releasing.`);
  }
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

function assertReleaseArchives(archivePaths: string[]) {
  const missingArchivePath = archivePaths.find((archivePath) => !fs.existsSync(archivePath));
  if (missingArchivePath) {
    throw new Error(`Missing release archive at ${missingArchivePath}.`);
  }

  const emptyArchivePath = archivePaths.find((archivePath) => fs.statSync(archivePath).size === 0);
  if (emptyArchivePath) {
    throw new Error(`Release archive is empty: ${emptyArchivePath}.`);
  }
}

function assertAppcastReferencesArchives(
  manifest: Awaited<ReturnType<typeof loadAppManifest>>,
  appPackage: ReturnType<typeof loadAppPackageMetadata>,
  archiveNames: string[],
) {
  const appcastPath = getMacOSSparkleAppcastPath(manifest);
  if (!fs.existsSync(appcastPath)) {
    throw new Error(`Missing Sparkle appcast at ${appcastPath}. Run bun scripts/package-macos-app.ts ${manifest.id} all first.`);
  }

  const appcast = fs.readFileSync(appcastPath, "utf8");
  const missingArchiveName = archiveNames.find((archiveName) => !appcast.includes(archiveName));
  if (missingArchiveName) {
    throw new Error(
      `Sparkle appcast ${path.relative(rootDir, appcastPath)} does not reference ${missingArchiveName}. Run bun scripts/package-macos-app.ts ${manifest.id} all again.`,
    );
  }

  const version = getMacOSReleaseVersion(appPackage);
  if (!appcast.includes(version)) {
    throw new Error(`Sparkle appcast ${path.relative(rootDir, appcastPath)} does not reference version ${version}.`);
  }
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
    throw new Error("Usage: bun scripts/github-release-app.ts <app> [arm|x86|all] [--notes-file <path>] [--allow-dirty]");
  }

  const options = parseOptions(args);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, "macos");

  const appPackage = loadAppPackageMetadata(appId);
  assertStableReleaseVersion(appPackage);

  const changelog = ensureAppChangelogEntry(manifest, appPackage);
  if (changelog.updated && !options.allowDirty) {
    throw new Error(
      `Updated ${path.relative(rootDir, changelog.changelogPath)} for ${changelog.version}. Review and commit it, then rerun the release.`,
    );
  }

  const distDir = getMacOSReleaseDistDir(manifest);
  const archivePaths = getReleaseArchitectures(options.arch).map((arch) =>
    path.join(distDir, getMacOSReleaseArchiveName(manifest, appPackage, arch))
  );
  const archiveNames = getReleaseArchitectures(options.arch).map((arch) =>
    getMacOSReleaseArchiveName(manifest, appPackage, arch)
  );
  assertReleaseArchives(archivePaths);
  assertAppcastReferencesArchives(manifest, appPackage, archiveNames);

  assertGitHubCli();
  assertGitHubAuth();
  assertCleanGitStatus(options);
  fetchTags();

  const tagName = getGitHubReleaseTag(manifest, appPackage);
  assertVersionIncremented(manifest, appPackage);
  assertTagIsNew(tagName);
  assertGitHubReleaseIsNew(tagName);

  runCommand("git", ["tag", "-a", tagName, "-m", `${manifest.displayName} ${getMacOSReleaseVersion(appPackage)}`], {
    cwd: rootDir,
  });

  if (!options.skipPushTag) {
    runCommand("git", ["push", "origin", tagName], { cwd: rootDir });
  }

  const releaseNotes = readReleaseNotes(
    options.notesFile,
    changelog.releaseNotes,
  );
  if (!releaseNotes.trim()) {
    throw new Error(`No release notes found for ${manifest.displayName} ${getMacOSReleaseVersion(appPackage)}.`);
  }

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
    ...archivePaths,
    ...deltaFiles,
  ], { cwd: rootDir });

  console.log(`Created GitHub release ${tagName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
