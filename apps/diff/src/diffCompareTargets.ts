import { commandRunner } from "@legend-desktop/command-runner";
import { getFilename, type DiffFolderCompareBase, type DiffOpenSource } from "./diffFiles";

export const diffCompareToolbarTargetHead = "head";
export const diffCompareToolbarTargetAutoBase = "auto-base";
export const diffCompareToolbarTargetChooseRef = "choose-ref";
const refValuePrefix = "ref:";

export type DiffCompareToolbarSelection = string;

export type DiffCompareToolbarMenuItem = {
  enabled?: boolean;
  label?: string;
  selected?: boolean;
  separator?: boolean;
  systemImageName?: string;
  value?: DiffCompareToolbarSelection;
};

export type DiffCompareRepoState = {
  currentBranch: string | null;
  defaultBranch: string | null;
  localBranches: string[];
  remoteBranches: string[];
  repoPath: string;
  upstreamBranch: string | null;
};

export type DiffCompareToolbarModel = {
  activeLabel: string;
  activeSelection: DiffCompareToolbarSelection;
  label: string;
  menuItems: DiffCompareToolbarMenuItem[];
  repoPath: string;
  tooltip: string;
};

function uniqueValues(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function stripOriginHead(value: string) {
  return value === "origin/HEAD" ? null : value;
}

function refSelection(ref: string) {
  return `${refValuePrefix}${ref}`;
}

function refFromSelection(selection: string) {
  return selection.startsWith(refValuePrefix) ? selection.slice(refValuePrefix.length) : null;
}

function getLocalRepoPath(source: DiffOpenSource | null | undefined) {
  if (source?.kind === "folder") {
    return source.value;
  }
  if (source?.kind === "git") {
    return source.cwd;
  }
  return null;
}

export function getDiffFolderCompareBaseLabel(compareBase: DiffFolderCompareBase | undefined) {
  if (!compareBase || compareBase.kind === "head") {
    return "HEAD";
  }
  return compareBase.ref;
}

function getActiveSelection(source: DiffOpenSource | null | undefined) {
  if (source?.kind === "folder") {
    return source.compareBase?.kind === "ref"
      ? refSelection(source.compareBase.ref)
      : diffCompareToolbarTargetHead;
  }
  if (source?.kind === "git" && source.args.length === 1 && !source.args[0]?.startsWith("-")) {
    return refSelection(source.args[0] ?? "");
  }
  return diffCompareToolbarTargetHead;
}

function getActiveLabel(source: DiffOpenSource | null | undefined) {
  if (source?.kind === "folder") {
    return getDiffFolderCompareBaseLabel(source.compareBase);
  }
  if (source?.kind === "git" && source.args.length === 1 && !source.args[0]?.startsWith("-")) {
    return source.args[0] ?? "HEAD";
  }
  return "HEAD";
}

function createMenuItem({
  activeSelection,
  label,
  selection,
  systemImageName,
}: {
  activeSelection: string;
  label: string;
  selection: string;
  systemImageName: string;
}): DiffCompareToolbarMenuItem {
  return {
    label,
    selected: selection === activeSelection,
    systemImageName,
    value: selection,
  };
}

function createRefMenuItems(activeSelection: string, refs: readonly string[], systemImageName: string) {
  return refs.map((ref) => createMenuItem({
    activeSelection,
    label: ref,
    selection: refSelection(ref),
    systemImageName,
  }));
}

function createSeparator(): DiffCompareToolbarMenuItem {
  return {
    separator: true,
  };
}

export function getDiffCompareToolbarModel(
  source: DiffOpenSource | null | undefined,
  repoState: DiffCompareRepoState | null,
): DiffCompareToolbarModel | null {
  const repoPath = getLocalRepoPath(source);
  if (!repoPath) {
    return null;
  }

  const activeLabel = getActiveLabel(source);
  const activeSelection = getActiveSelection(source);
  const priorityRefs = uniqueValues([
    repoState?.upstreamBranch ?? "",
    repoState?.defaultBranch ?? "",
  ]);
  const priorityRefSet = new Set(priorityRefs);
  const localBranches = uniqueValues(repoState?.localBranches ?? []).filter((branch) => !priorityRefSet.has(branch));
  const remoteBranches = uniqueValues(repoState?.remoteBranches ?? [])
    .map(stripOriginHead)
    .filter((branch): branch is string => branch !== null)
    .filter((branch) => !priorityRefSet.has(branch));
  const menuItems: DiffCompareToolbarMenuItem[] = [
    ...(repoState?.defaultBranch ? [createMenuItem({
      activeSelection,
      label: `Auto Base (${repoState.defaultBranch})`,
      selection: diffCompareToolbarTargetAutoBase,
      systemImageName: "wand.and.stars",
    })] : []),
    createMenuItem({
      activeSelection,
      label: "HEAD",
      selection: diffCompareToolbarTargetHead,
      systemImageName: "clock.arrow.circlepath",
    }),
    ...(priorityRefs.length > 0 ? [
      createSeparator(),
      ...createRefMenuItems(activeSelection, priorityRefs, "arrow.triangle.branch"),
    ] : []),
    ...(localBranches.length > 0 ? [
      createSeparator(),
      ...createRefMenuItems(activeSelection, localBranches, "point.3.connected.trianglepath.dotted"),
    ] : []),
    ...(remoteBranches.length > 0 ? [
      createSeparator(),
      ...createRefMenuItems(activeSelection, remoteBranches, "cloud"),
    ] : []),
    createSeparator(),
    {
      label: "Choose branch or ref...",
      systemImageName: "text.cursor",
      value: diffCompareToolbarTargetChooseRef,
    },
  ];

  return {
    activeLabel,
    activeSelection,
    label: `Worktree vs ${activeLabel}`,
    menuItems,
    repoPath,
    tooltip: `Currently comparing Worktree vs ${activeLabel}`,
  };
}

async function runGitValue(repoPath: string, args: string[]) {
  const result = await commandRunner.runCommand({
    args,
    command: "git",
    cwd: repoPath,
    timeoutMs: 5_000,
  });
  return result.exitCode === 0 ? result.stdout.trim() || null : null;
}

async function runGitLines(repoPath: string, args: string[]) {
  const value = await runGitValue(repoPath, args);
  return value ? value.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

export async function loadDiffCompareRepoState(repoPath: string): Promise<DiffCompareRepoState> {
  const [
    currentBranch,
    upstreamBranch,
    defaultBranchRaw,
    localBranchRefs,
    remoteBranchRefs,
  ] = await Promise.all([
    runGitValue(repoPath, ["branch", "--show-current"]),
    runGitValue(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    runGitValue(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
    runGitLines(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]),
    runGitLines(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]),
  ]);

  const defaultBranch = defaultBranchRaw?.replace(/^origin\/HEAD$/, "") || stripOriginHead(defaultBranchRaw ?? "");
  return {
    currentBranch,
    defaultBranch,
    localBranches: uniqueValues(localBranchRefs),
    remoteBranches: uniqueValues(remoteBranchRefs),
    repoPath,
    upstreamBranch,
  };
}

export function createDiffCompareSource(
  repoPath: string,
  selection: DiffCompareToolbarSelection,
  repoState: DiffCompareRepoState | null,
): DiffOpenSource | null {
  let compareBase: DiffFolderCompareBase | undefined;
  if (selection === diffCompareToolbarTargetChooseRef) {
    return null;
  } else if (selection === diffCompareToolbarTargetHead) {
    compareBase = undefined;
  } else if (selection === diffCompareToolbarTargetAutoBase) {
    compareBase = repoState?.defaultBranch
      ? {
        kind: "ref",
        ref: repoState.defaultBranch,
        useMergeBase: true,
      }
      : undefined;
  } else {
    const ref = refFromSelection(selection) ?? selection;
    compareBase = {
      kind: "ref",
      ref,
      useMergeBase: true,
    };
  }

  return {
    ...(compareBase ? { compareBase } : {}),
    kind: "folder",
    label: getFilename(repoPath),
    value: repoPath,
  };
}

export function createDiffCompareSourceForRef(repoPath: string, ref: string): DiffOpenSource {
  return {
    compareBase: {
      kind: "ref",
      ref,
      useMergeBase: true,
    },
    kind: "folder",
    label: getFilename(repoPath),
    value: repoPath,
  };
}
