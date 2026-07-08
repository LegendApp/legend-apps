import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { appsDir, rootDir } from "./apps";
import { getGitHubReleaseTag, getMacOSReleaseVersion } from "./release";
import type { AppManifest, AppPackageMetadata } from "./types";

export type AppChangelogResult = {
  changelogPath: string;
  releaseNotes: string;
  updated: boolean;
  version: string;
};

function runGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim());
  }

  return result.stdout.trim();
}

function tryRunGit(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  return result.status === 0 ? result.stdout.trim() : undefined;
}

export function getAppChangelogPath(appId: string) {
  return path.join(appsDir, appId, "CHANGELOG.md");
}

function getAppReleaseTags(appId: string) {
  const output = runGit([
    "for-each-ref",
    "--sort=-creatordate",
    "--format=%(refname:short)",
    `refs/tags/${appId}-v*`,
  ]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function getPreviousReleaseTag(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const currentTag = getGitHubReleaseTag(manifest, appPackage);
  return getAppReleaseTags(manifest.id).find((tag) => tag !== currentTag);
}

function getFallbackCommitRange() {
  const upstream = tryRunGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  if (!upstream) {
    return undefined;
  }

  const mergeBase = tryRunGit(["merge-base", "HEAD", upstream]);
  if (!mergeBase) {
    return undefined;
  }

  const commitCount = Number(tryRunGit(["rev-list", "--count", `${mergeBase}..HEAD`]) ?? 0);
  return commitCount > 0 ? `${mergeBase}..HEAD` : undefined;
}

function getCommitRange(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const previousTag = getPreviousReleaseTag(manifest, appPackage);
  return previousTag ? `${previousTag}..HEAD` : getFallbackCommitRange();
}

function getCommitSubjects(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const commitRange = getCommitRange(manifest, appPackage);
  if (!commitRange) {
    return [];
  }

  const output = runGit([
    "log",
    "--no-merges",
    "--pretty=format:%s",
    commitRange,
  ]);
  const seen = new Set<string>();
  return output
    .split("\n")
    .map((subject) => subject.trim())
    .filter((subject) => subject && !/^version\s+\d/i.test(subject))
    .filter((subject) => {
      const key = subject.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function sentenceCase(text: string) {
  return text.slice(0, 1).toUpperCase() + text.slice(1);
}

function formatCommitSubject(subject: string) {
  const withoutType = subject.replace(/^(?:feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(?:\([^)]*\))?:\s*/i, "");
  const normalized = sentenceCase(withoutType.trim()).replace(/\.\s*$/, "");
  return normalized ? `${normalized}.` : subject;
}

function generateReleaseNotes(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const subjects = getCommitSubjects(manifest, appPackage);
  if (subjects.length === 0) {
    return "- Initial release.";
  }

  return subjects.map((subject) => `- ${formatCommitSubject(subject)}`).join("\n");
}

function findVersionSection(content: string, version: string) {
  const lines = content.split("\n");
  const headerRegex = new RegExp(`^##\\s+v?${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`);
  const startIndex = lines.findIndex((line) => headerRegex.test(line));
  if (startIndex < 0) {
    return undefined;
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIndex = index;
      break;
    }
  }

  const releaseNotes = lines.slice(startIndex + 1, endIndex).join("\n").trim();
  return { releaseNotes };
}

function insertReleaseSection(content: string, version: string, releaseNotes: string, displayName: string) {
  const normalizedContent = content.trim();
  const section = `## ${version}\n\n${releaseNotes}`;
  if (!normalizedContent) {
    return `# ${displayName} Changelog\n\n${section}\n`;
  }

  const lines = normalizedContent.split("\n");
  const firstVersionHeaderIndex = lines.findIndex((line) => line.startsWith("## "));
  if (firstVersionHeaderIndex >= 0) {
    return [
      ...lines.slice(0, firstVersionHeaderIndex),
      "",
      section,
      "",
      ...lines.slice(firstVersionHeaderIndex),
      "",
    ].join("\n");
  }

  return `${normalizedContent}\n\n${section}\n`;
}

export function ensureAppChangelogEntry(
  manifest: AppManifest,
  appPackage: AppPackageMetadata,
  options: { write?: boolean } = {},
): AppChangelogResult {
  const changelogPath = getAppChangelogPath(manifest.id);
  const version = getMacOSReleaseVersion(appPackage);
  const existingContent = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, "utf8") : "";
  const existingSection = findVersionSection(existingContent, version);
  if (existingSection) {
    return {
      changelogPath,
      releaseNotes: existingSection.releaseNotes,
      updated: false,
      version,
    };
  }

  const releaseNotes = generateReleaseNotes(manifest, appPackage);
  const nextContent = insertReleaseSection(existingContent, version, releaseNotes, manifest.displayName);
  if (options.write !== false) {
    fs.writeFileSync(changelogPath, nextContent);
  }

  return {
    changelogPath,
    releaseNotes,
    updated: true,
    version,
  };
}
