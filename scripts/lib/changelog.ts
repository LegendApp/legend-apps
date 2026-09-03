import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appsDir, rootDir } from "./apps";
import {
  buildReleaseNotesPrompt,
  collectWorkspaceDependencyScope,
  filterAppReleaseCommits,
  normalizeGeneratedReleaseNotes,
  parseReleaseCommitLog,
  sharedReleasePaths,
  type WorkspacePackage,
} from "./changelogScope";
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

function getWorkspacePackages() {
  const workspaceDirectories = [
    ...["apps", "packages"].flatMap((parentDirectory) =>
      fs.readdirSync(path.join(rootDir, parentDirectory), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(parentDirectory, entry.name))
    ),
    "shell",
  ];

  return workspaceDirectories.flatMap<WorkspacePackage>((directory) => {
    const packagePath = path.join(rootDir, directory, "package.json");
    if (!fs.existsSync(packagePath)) {
      return [];
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (typeof packageJson.name !== "string") {
      return [];
    }

    return [{
      dependencies: Object.keys({
        ...packageJson.peerDependencies,
        ...packageJson.optionalDependencies,
        ...packageJson.dependencies,
      }),
      directory: directory.split(path.sep).join("/"),
      name: packageJson.name,
    }];
  });
}

function getAppDependencyScope(manifest: AppManifest) {
  return collectWorkspaceDependencyScope(
    getWorkspacePackages(),
    `apps/${manifest.id}`,
    Object.values(manifest.nativeModules).flat(),
  );
}

function getReleaseCommits(commitRange: string) {
  const output = runGit([
    "log",
    "--no-merges",
    "--format=%x1e%H%x1f%s%x1f%b%x1d",
    "--name-only",
    commitRange,
  ]);
  if (!output) {
    return [];
  }

  return parseReleaseCommitLog(output)
    .filter((commit) => !/^(?:version\s+\d|release(?:\s|:)|update changelog)/i.test(commit.subject));
}

type AgentCli = {
  command: string;
  name: string;
  outputFile: boolean;
};

function findExecutable(command: string) {
  for (const directory of process.env.PATH?.split(path.delimiter) ?? []) {
    const executablePath = path.join(directory, command);
    try {
      fs.accessSync(executablePath, fs.constants.X_OK);
      return executablePath;
    } catch {
      // Keep looking in PATH.
    }
  }
}

function findAgentCli() {
  const candidates: AgentCli[] = [
    { command: "codex", name: "Codex", outputFile: true },
    { command: "claude", name: "Claude", outputFile: false },
  ];

  for (const candidate of candidates) {
    const executablePath = findExecutable(candidate.command);
    if (executablePath) {
      return { ...candidate, executablePath };
    }
  }
}

function runChangelogAgent(prompt: string) {
  const agent = findAgentCli();
  if (!agent) {
    throw new Error("Codex CLI and Claude CLI were not found. Install one before preparing a changelog.");
  }

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "legend-app-changelog-"));
  const outputPath = path.join(temporaryDirectory, "release-notes.md");
  const args = agent.outputFile
    ? [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "-c",
      'approval_policy="never"',
      "-c",
      'model_reasoning_effort="medium"',
      "--output-last-message",
      outputPath,
      prompt,
    ]
    : ["-p", prompt];

  console.log(`Generating curated release notes with ${agent.name}...`);
  try {
    const result = spawnSync(agent.executablePath, args, {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: agent.outputFile ? ["ignore", "inherit", "inherit"] : "pipe",
      timeout: 10 * 60 * 1000,
    });
    if (result.status !== 0) {
      const output = `${result.stderr ?? ""}${result.stdout ?? ""}`.trim();
      throw new Error(output || `${agent.name} exited with status ${result.status ?? "unknown"}.`);
    }

    const output = agent.outputFile
      ? fs.readFileSync(outputPath, "utf8")
      : result.stdout ?? "";
    return normalizeGeneratedReleaseNotes(output);
  } finally {
    fs.rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function generateReleaseNotes(manifest: AppManifest, appPackage: AppPackageMetadata) {
  const commitRange = getCommitRange(manifest, appPackage);
  if (!commitRange) {
    return "- Initial release.";
  }

  const dependencyScope = getAppDependencyScope(manifest);
  const commits = filterAppReleaseCommits(
    getReleaseCommits(commitRange),
    manifest.id,
    dependencyScope.directories,
    dependencyScope.dependencyNames,
  );
  if (commits.length === 0) {
    throw new Error(`No commits affecting ${manifest.displayName} were found in ${commitRange}.`);
  }

  return runChangelogAgent(buildReleaseNotesPrompt({
    appDisplayName: manifest.displayName,
    appId: manifest.id,
    commitRange,
    commits,
    relevantDirectories: [...new Set([
      ...dependencyScope.directories,
      ...sharedReleasePaths,
      ...commits.flatMap((commit) => commit.files.filter((file) => file.startsWith("patches/"))),
    ])],
    version: getMacOSReleaseVersion(appPackage),
  }));
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
