import { commandRunner } from "@legend-apps/command-runner";
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

const gitRefFormat = "%(refname)%09%(HEAD)%09%(upstream:short)%09%(symref:short)";
const localRefPrefix = "refs/heads/";
const remoteRefPrefix = "refs/remotes/";

export function parseDiffCompareRepoRefs(value: string | null) {
  let currentBranch: string | null = null;
  let defaultBranch: string | null = null;
  let upstreamBranch: string | null = null;
  const localBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const line of value?.split("\n") ?? []) {
    const [refName = "", head = "", upstream = "", symref = ""] = line.split("\t");
    if (refName.startsWith(localRefPrefix)) {
      const branch = refName.slice(localRefPrefix.length);
      localBranches.push(branch);
      if (head === "*") {
        currentBranch = branch;
        upstreamBranch = upstream || null;
      }
    } else if (refName.startsWith(remoteRefPrefix)) {
      const branch = refName.slice(remoteRefPrefix.length);
      remoteBranches.push(branch);
      if (refName === "refs/remotes/origin/HEAD") {
        defaultBranch = symref || null;
      }
    }
  }

  return {
    currentBranch,
    defaultBranch,
    localBranches: uniqueValues(localBranches),
    remoteBranches: uniqueValues(remoteBranches),
    upstreamBranch,
  };
}

export async function loadDiffCompareRepoState(repoPath: string): Promise<DiffCompareRepoState> {
  const commands = [
    { args: ["for-each-ref", `--format=${gitRefFormat}`, "refs/heads", "refs/remotes"], command: "git", cwd: repoPath, timeoutMs: 5_000 },
    { args: ["remote"], command: "git", cwd: repoPath, timeoutMs: 5_000 },
  ];
  const [refsResult, remotesResult] = await commandRunner.runCommands(commands);
  const refsValue = refsResult.exitCode === 0 ? refsResult.stdout.trim() || null : null;
  const remoteNames = remotesResult.exitCode === 0
    ? remotesResult.stdout.split("\n").map((line) => line.trim()).filter(Boolean)
    : [];
  const refs = parseDiffCompareRepoRefs(refsValue);

  return {
    ...refs,
    remoteNames: uniqueValues(remoteNames),
    repoPath,
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
