export type WorkspacePackage = {
  dependencies: string[];
  directory: string;
  name: string;
};

export type ReleaseCommit = {
  body?: string;
  files: string[];
  hash: string;
  subject: string;
};

export const sharedReleasePaths = ["shell"];

function matchesPath(file: string, directory: string) {
  return file === directory || file.startsWith(`${directory}/`);
}

export function parseReleaseCommitLog(output: string) {
  return output
    .split("\x1e")
    .map((block) => block.trim())
    .filter(Boolean)
    .map<ReleaseCommit>((block) => {
      const [metadata, filesOutput = ""] = block.split("\x1d", 2);
      const [hash, subject, body = ""] = metadata.trim().split("\x1f", 3);
      return {
        body: body.trim(),
        files: filesOutput.split("\n").map((file) => file.trim()).filter(Boolean),
        hash,
        subject,
      };
    });
}

export function collectWorkspaceDependencyScope(
  workspaces: WorkspacePackage[],
  appDirectory: string,
  additionalDependencies: string[] = [],
) {
  const workspaceByDirectory = new Map(workspaces.map((workspace) => [workspace.directory, workspace]));
  const workspaceByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const appWorkspace = workspaceByDirectory.get(appDirectory);
  if (!appWorkspace) {
    throw new Error(`Could not find workspace package for ${appDirectory}.`);
  }

  const directories = new Set<string>();
  const dependencyNames = new Set(additionalDependencies);
  const pending = [
    appWorkspace,
    ...additionalDependencies.flatMap((dependency) => {
      const workspace = workspaceByName.get(dependency);
      return workspace && !workspace.directory.startsWith("apps/") ? [workspace] : [];
    }),
  ];
  while (pending.length > 0) {
    const workspace = pending.pop()!;
    if (directories.has(workspace.directory)) {
      continue;
    }

    directories.add(workspace.directory);
    for (const dependency of workspace.dependencies) {
      dependencyNames.add(dependency);
      const dependencyWorkspace = workspaceByName.get(dependency);
      if (dependencyWorkspace && !dependencyWorkspace.directory.startsWith("apps/")) {
        pending.push(dependencyWorkspace);
      }
    }
  }

  return {
    dependencyNames: [...dependencyNames].sort(),
    directories: [...directories].sort(),
  };
}

export function collectWorkspaceDependencyDirectories(
  workspaces: WorkspacePackage[],
  appDirectory: string,
  additionalDependencies: string[] = [],
) {
  return collectWorkspaceDependencyScope(workspaces, appDirectory, additionalDependencies).directories;
}

export function filterAppReleaseCommits(
  commits: ReleaseCommit[],
  appId: string,
  appDependencyDirectories: string[],
  dependencyNames: string[] = [],
) {
  const selectedAppDirectory = `apps/${appId}`;

  return commits.filter((commit) => {
    const directlyRelevant = commit.files.some((file) =>
      appDependencyDirectories.some((directory) => matchesPath(file, directory))
    );
    if (directlyRelevant) {
      return true;
    }

    const patchesRelevantDependency = commit.files.some((file) =>
      dependencyNames.some((dependency) => file.startsWith(`patches/${dependency}@`))
    );
    if (patchesRelevantDependency) {
      return true;
    }

    const affectsGlobalRuntime = commit.files.some((file) =>
      sharedReleasePaths.some((directory) => matchesPath(file, directory))
    );
    if (!affectsGlobalRuntime) {
      return false;
    }

    // Shell changes made alongside another app are usually infrastructure for
    // that app. Changes to a dependency used by this app remain candidates.
    return !commit.files.some((file) =>
      file.startsWith("apps/") && !matchesPath(file, selectedAppDirectory)
    );
  });
}

export function buildReleaseNotesPrompt(options: {
  appDisplayName: string;
  appId: string;
  commitRange: string;
  commits: ReleaseCommit[];
  relevantDirectories: string[];
  version: string;
}) {
  const commits = options.commits
    .map((commit) => {
      const body = commit.body?.replace(/\s+/g, " ").trim().slice(0, 1000);
      return `- ${commit.hash} ${commit.subject}${body ? `\n  Commit context: ${body}` : ""}`;
    })
    .join("\n");
  const directories = options.relevantDirectories.map((directory) => `- ${directory}`).join("\n");

  return [
    `Write the release notes for ${options.appDisplayName} ${options.version} (${options.appId}).`,
    `The release range is ${options.commitRange}. These are candidate commits after app path filtering; not every candidate requires an entry:`,
    commits,
    "",
    "Paths considered relevant to this app:",
    directories,
    "",
    "Inspect the actual diffs and tests for those commits, limited to the relevant paths, before writing.",
    "Work efficiently: use the commit context first, then at most four batched Git commands for ambiguous behavior; do not inspect files one by one or read generated/vendor artifacts.",
    "Treat the changelog as curated release notes, not a commit inventory.",
    "Group related commits into one entry for each user-facing change and use the fewest entries that remain complete.",
    "Describe the resulting behavior in plain language instead of rewriting commit subjects or implementation details.",
    "Omit tests, fixtures, diagnostics, build plumbing, and internal refactors unless users need them to understand a visible behavior or compatibility fix.",
    "A candidate may touch shared code for another app; omit it unless its relevant-path diff changes this app's user-visible behavior.",
    "Do not mention changes belonging only to other apps, even when they are in the same commits.",
    "Classify each entry as Feat, Fix, Perf, Improvement, or Breaking and order the most important changes first.",
    "If a relevant commit references an issue such as #123, retain that reference in the matching entry.",
    "Output only a Markdown bullet list, with one concise sentence per bullet and no heading, preamble, or code fence.",
    "Use exactly this shape: - Fix: User-visible behavior.",
  ].join("\n");
}

export function normalizeGeneratedReleaseNotes(output: string) {
  const unfenced = output.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1").trim();
  const lines = unfenced.split("\n").map((line) => line.trim()).filter(Boolean);
  if (
    lines.length === 0 ||
    lines.some((line) => !/^- (?:Feat|Fix|Perf|Improvement|Breaking):\s+\S/i.test(line))
  ) {
    throw new Error(
      "The changelog agent did not return the expected Markdown bullets (for example, '- Fix: ...').",
    );
  }

  return lines.join("\n");
}
