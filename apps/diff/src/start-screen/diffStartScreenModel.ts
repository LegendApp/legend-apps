import type { RecentDiffSource } from "../diffAppMetadata";
import type { DiffOpenSource } from "../diffFiles";

export type DiffRecentFilter = "all" | "folders" | "prs" | "commits";

export type DiffRecentSourceKind = "commit" | "folder" | "git" | "pullRequest";

export type DiffRecentSourceGroupKey = "commits" | "folders" | "gitDiffs" | "pullRequests";

export type DiffRecentSourceGroup = {
  key: DiffRecentSourceGroupKey;
  recentSources: RecentDiffSource[];
  title: string;
};

export const diffRecentFilters: { key: DiffRecentFilter; title: string }[] = [
  { key: "all", title: "All" },
  { key: "folders", title: "Folders" },
  { key: "prs", title: "PRs" },
  { key: "commits", title: "Commits" },
];

function getGithubPathname(source: DiffOpenSource) {
  let pathname = "";
  try {
    pathname = new URL(source.value).pathname;
  } catch {
    pathname = "";
  }
  return pathname;
}

export function getRecentDiffSourceKind(source: DiffOpenSource): DiffRecentSourceKind {
  if (source.kind === "folder") {
    return "folder";
  }
  if (source.kind === "git") {
    return "git";
  }

  const pathname = getGithubPathname(source);
  return pathname.includes("/commit/") ? "commit" : "pullRequest";
}

export function getRecentDiffSourceTypeLabel(source: DiffOpenSource) {
  const kind = getRecentDiffSourceKind(source);
  if (kind === "folder") {
    return "Folder";
  }
  if (kind === "commit") {
    return "Commit";
  }
  if (kind === "git") {
    return "Git diff";
  }
  return "PR";
}

export function getRecentDiffSourceDetail(source: DiffOpenSource) {
  if (source.kind === "git") {
    return `${source.cwd} ${source.args.join(" ")}`;
  }
  return source.value;
}

export function formatRecentDiffSourceOpenedAt(lastOpenedAt: number, now = Date.now()) {
  const elapsedMs = Math.max(0, now - lastOpenedAt);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < minuteMs) {
    return "Just now";
  }
  if (elapsedMs < hourMs) {
    const minutes = Math.max(1, Math.floor(elapsedMs / minuteMs));
    return `${minutes}m ago`;
  }
  if (elapsedMs < dayMs) {
    const hours = Math.max(1, Math.floor(elapsedMs / hourMs));
    return `${hours}h ago`;
  }
  if (elapsedMs < 2 * dayMs) {
    return "Yesterday";
  }

  const days = Math.floor(elapsedMs / dayMs);
  return `${days}d ago`;
}

function getGroupKeyForKind(kind: DiffRecentSourceKind): DiffRecentSourceGroupKey {
  if (kind === "folder") {
    return "folders";
  }
  if (kind === "pullRequest") {
    return "pullRequests";
  }
  if (kind === "commit") {
    return "commits";
  }
  return "gitDiffs";
}

function getGroupTitle(key: DiffRecentSourceGroupKey) {
  if (key === "folders") {
    return "Folders";
  }
  if (key === "pullRequests") {
    return "Pull requests";
  }
  if (key === "commits") {
    return "Commits";
  }
  return "Git diffs";
}

function matchesFilter(kind: DiffRecentSourceKind, filter: DiffRecentFilter) {
  return filter === "all" ||
    (filter === "folders" && kind === "folder") ||
    (filter === "prs" && kind === "pullRequest") ||
    (filter === "commits" && kind === "commit");
}

export function getGroupedRecentDiffSources(
  recentSources: RecentDiffSource[],
  filter: DiffRecentFilter,
): DiffRecentSourceGroup[] {
  const groupOrder: DiffRecentSourceGroupKey[] = ["folders", "pullRequests", "commits", "gitDiffs"];
  const groups = new Map<DiffRecentSourceGroupKey, RecentDiffSource[]>();

  for (const recentSource of recentSources) {
    const kind = getRecentDiffSourceKind(recentSource.source);
    if (matchesFilter(kind, filter)) {
      const groupKey = getGroupKeyForKind(kind);
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), recentSource]);
    }
  }

  return groupOrder
    .map((groupKey) => ({
      key: groupKey,
      recentSources: groups.get(groupKey) ?? [],
      title: getGroupTitle(groupKey),
    }))
    .filter((group) => group.recentSources.length > 0);
}
