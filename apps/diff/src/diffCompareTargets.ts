import { commandRunner } from "@legend-desktop/command-runner";
import { getFilename, type DiffFolderCompareBase, type DiffOpenSource } from "./diffFiles";

export const diffCompareToolbarTargetHead = "head";
export const diffCompareToolbarTargetChooseRef = "choose-ref";
const refValuePrefix = "ref:";
const commonPriorityBranches = ["main", "master", "dev", "develop"];

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
  remoteNames: string[];
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

function stripRemoteHead(value: string) {
  return value.endsWith("/HEAD") ? null : value;
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

function getLocalRefForRemoteRef(ref: string | null | undefined) {
  if (!ref) {
    return null;
  }
  const separatorIndex = ref.indexOf("/");
  return separatorIndex >= 0 ? ref.slice(separatorIndex + 1) : null;
}

function getRemoteNameForRemoteRef(ref: string) {
  const separatorIndex = ref.indexOf("/");
  return separatorIndex >= 0 ? ref.slice(0, separatorIndex) : null;
}

function getConfiguredRemoteBranches(repoState: DiffCompareRepoState | null) {
  if (!repoState) {
    return [];
  }

  const remoteNameSet = new Set(repoState.remoteNames);
  return uniqueValues(repoState.remoteBranches)
    .map(stripRemoteHead)
    .filter((branch): branch is string => branch !== null)
    .filter((branch) => {
      const remoteName = getRemoteNameForRemoteRef(branch);
      return remoteName !== null && remoteNameSet.has(remoteName);
    });
}

function getPriorityRefs(repoState: DiffCompareRepoState | null) {
  if (!repoState) {
    return [];
  }

  const localBranchSet = new Set(repoState.localBranches);
  const remoteBranches = getConfiguredRemoteBranches(repoState);
  const remoteBranchSet = new Set(remoteBranches);
  const getRemoteRefsForLocalBranch = (localBranch: string) => remoteBranches.filter((remoteBranch) => (
    getLocalRefForRemoteRef(remoteBranch) === localBranch
  ));
  const priorityCandidates = [
    repoState.defaultBranch ?? "",
    getLocalRefForRemoteRef(repoState.defaultBranch) ?? "",
    repoState.upstreamBranch ?? "",
    getLocalRefForRemoteRef(repoState.upstreamBranch) ?? "",
    ...commonPriorityBranches.flatMap((branch) => [
      localBranchSet.has(branch) ? branch : "",
      ...getRemoteRefsForLocalBranch(branch),
    ]),
  ];

  return uniqueValues(priorityCandidates).filter((ref) => (
    localBranchSet.has(ref) || remoteBranchSet.has(ref)
  ));
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
  const priorityRefs = getPriorityRefs(repoState);
  const priorityRefSet = new Set(priorityRefs);
  const localBranches = uniqueValues(repoState?.localBranches ?? []).filter((branch) => !priorityRefSet.has(branch));
  const remoteBranches = getConfiguredRemoteBranches(repoState).filter((branch) => !priorityRefSet.has(branch));
  const menuItems: DiffCompareToolbarMenuItem[] = [
    ...(priorityRefs.length > 0 ? [
      ...createRefMenuItems(activeSelection, priorityRefs, "arrow.triangle.branch"),
      createSeparator(),
    ] : []),
    createMenuItem({
      activeSelection,
      label: "HEAD",
      selection: diffCompareToolbarTargetHead,
      systemImageName: "clock.arrow.circlepath",
    }),
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
    remoteNames,
  ] = await Promise.all([
    runGitValue(repoPath, ["branch", "--show-current"]),
    runGitValue(repoPath, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]),
    runGitValue(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
    runGitLines(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]),
    runGitLines(repoPath, ["for-each-ref", "--format=%(refname:short)", "refs/remotes"]),
    runGitLines(repoPath, ["remote"]),
  ]);

  const defaultBranch = defaultBranchRaw?.replace(/^origin\/HEAD$/, "") || stripRemoteHead(defaultBranchRaw ?? "");
  return {
    currentBranch,
    defaultBranch,
    localBranches: uniqueValues(localBranchRefs),
    remoteBranches: uniqueValues(remoteBranchRefs),
    remoteNames: uniqueValues(remoteNames),
    repoPath,
    upstreamBranch,
  };
}

export function createDiffCompareSource(
  repoPath: string,
  selection: DiffCompareToolbarSelection,
  _repoState: DiffCompareRepoState | null,
): DiffOpenSource | null {
  let compareBase: DiffFolderCompareBase | undefined;
  if (selection === diffCompareToolbarTargetChooseRef) {
    return null;
  } else if (selection === diffCompareToolbarTargetHead) {
    compareBase = undefined;
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
