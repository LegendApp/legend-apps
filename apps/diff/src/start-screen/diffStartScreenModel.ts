import type { RecentDiffSource } from "../diffAppMetadata";
import { getDiffFolderCompareBaseKey, type DiffOpenSource } from "../diffFiles";

export type DiffRecentFilter = "all" | "folders" | "files" | "prs" | "commits";

export type DiffRecentSourceKind = "commit" | "diffFile" | "filePair" | "folder" | "git" | "pullRequest";

export const diffRecentFilters: { key: DiffRecentFilter; title: string }[] = [
  { key: "all", title: "All" },
  { key: "folders", title: "Folders" },
  { key: "files", title: "Files" },
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
  if (source.kind === "filePair") {
    return "filePair";
  }
  if (source.kind === "diffFile") {
    return "diffFile";
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
  if (kind === "filePair") {
    return "Files";
  }
  if (kind === "diffFile") {
    return "Diff file";
  }
  return "PR";
}

export function getRecentDiffSourceDetail(source: DiffOpenSource) {
  if (source.kind === "folder" && getDiffFolderCompareBaseKey(source.compareBase) !== "head") {
    return `${source.value} -> ${source.compareBase?.kind === "ref" ? source.compareBase.ref : "HEAD"}`;
  }
  if (source.kind === "git") {
    return `${source.cwd} ${source.args.join(" ")}`;
  }
  if (source.kind === "filePair") {
    return `${source.oldPath} vs ${source.newPath}`;
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

function matchesFilter(kind: DiffRecentSourceKind, filter: DiffRecentFilter) {
  return filter === "all" ||
    (filter === "folders" && kind === "folder") ||
    (filter === "files" && (kind === "filePair" || kind === "diffFile")) ||
    (filter === "prs" && kind === "pullRequest") ||
    (filter === "commits" && kind === "commit");
}

export function getFilteredRecentDiffSources(
  recentSources: RecentDiffSource[],
  filter: DiffRecentFilter,
): RecentDiffSource[] {
  return recentSources
    .filter((recentSource) => matchesFilter(getRecentDiffSourceKind(recentSource.source), filter))
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}
