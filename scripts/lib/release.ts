import path from "node:path";
import { rootDir } from "./apps";
import type { AppManifest, AppPackageMetadata } from "./types";

const githubOwner = "LegendApp";
const githubRepo = "legend-apps";
const githubBranch = "main";

export function getMacOSReleaseVersion(appPackage: AppPackageMetadata) {
  const releaseVersion = appPackage.version.split(/[+-]/)[0];
  if (/^\d+(?:\.\d+){0,2}$/.test(releaseVersion)) {
    return releaseVersion;
  }

  throw new Error(`App version "${appPackage.version}" must start with one to three dot-separated numeric segments.`);
}

export function getMacOSReleaseBuild(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const build = manifest.release?.macos?.build ?? getMacOSReleaseVersion(appPackage);
  if (/^\d+(?:\.\d+){0,2}$/.test(build)) {
    return build;
  }

  throw new Error(`${manifest.id}/macos release build "${build}" must be one to three dot-separated numeric segments.`);
}

export function getMacOSSparkleFeedPath(manifest: AppManifest) {
  return manifest.release?.macos?.sparkle.feedPath ?? `updates/${manifest.id}/appcast.xml`;
}

export function getMacOSSparkleFeedUrl(manifest: AppManifest) {
  return `https://raw.githubusercontent.com/${githubOwner}/${githubRepo}/${githubBranch}/${getMacOSSparkleFeedPath(manifest)}`;
}

export function getMacOSSparklePublicEdKey(manifest: AppManifest) {
  const publicEdKey = manifest.release?.macos?.sparkle.publicEdKey;
  if (!publicEdKey) {
    throw new Error(`${manifest.id}/macos release metadata must define sparkle.publicEdKey.`);
  }

  return publicEdKey;
}

export function getGitHubReleaseTag(manifest: AppManifest, appPackage: AppPackageMetadata) {
  return `${manifest.id}-v${getMacOSReleaseVersion(appPackage)}`;
}

export function getGitHubReleaseDownloadUrlPrefix(manifest: AppManifest, appPackage: AppPackageMetadata) {
  return `https://github.com/${githubOwner}/${githubRepo}/releases/download/${getGitHubReleaseTag(manifest, appPackage)}/`;
}

export function getReleaseAssetStem(manifest: AppManifest) {
  return manifest.displayName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function getMacOSReleaseArchiveName(manifest: AppManifest, appPackage: AppPackageMetadata, arch: string) {
  return `${getReleaseAssetStem(manifest)}-${getMacOSReleaseVersion(appPackage)}-${arch}.zip`;
}

export function getMacOSReleaseDistDir(manifest: AppManifest) {
  return path.join(rootDir, "dist", manifest.id, "macos");
}

export function getMacOSSparkleAppcastPath(manifest: AppManifest) {
  return path.join(rootDir, getMacOSSparkleFeedPath(manifest));
}

