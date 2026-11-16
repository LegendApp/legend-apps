import { NitroModules } from "react-native-nitro-modules";
import type { DiffGitFolderLoadOptions, DiffParser, GitBlameHunk, GitHistoryHead, GitHistoryPage } from "./DiffParser.nitro";

let diffParser: DiffParser | undefined;

function getDiffParser() {
  diffParser ??= NitroModules.createHybridObject<DiffParser>("DiffParser");
  return diffParser;
}

function normalizeGitFolderLoadOptions(options?: Partial<DiffGitFolderLoadOptions>): Required<DiffGitFolderLoadOptions> {
  return {
    compareBaseKind: options?.compareBaseKind ?? "head",
    compareBaseRef: options?.compareBaseRef ?? "",
    compareUseMergeBase: options?.compareUseMergeBase ?? true,
    ignoreWhitespaceChanges: options?.ignoreWhitespaceChanges ?? false,
    showOnlyHunks: options?.showOnlyHunks ?? true,
    excludePaths: options?.excludePaths ?? [],
  };
}

export function loadGitFolderDiff(folderPath: string, initialRowCount = 200, options?: Partial<DiffGitFolderLoadOptions>) {
  const normalizedOptions = normalizeGitFolderLoadOptions(options);
  return getDiffParser().loadGitFolderDiff(
    folderPath,
    initialRowCount,
    normalizedOptions.showOnlyHunks,
    normalizedOptions.compareBaseKind,
    normalizedOptions.compareBaseRef,
    normalizedOptions.compareUseMergeBase,
    normalizedOptions.ignoreWhitespaceChanges,
    normalizedOptions.excludePaths,
  );
}

export function startGitFolderDiff(folderPath: string, options?: Partial<DiffGitFolderLoadOptions>) {
  const normalizedOptions = normalizeGitFolderLoadOptions(options);
  return getDiffParser().startGitFolderDiff(
    folderPath,
    normalizedOptions.showOnlyHunks,
    normalizedOptions.compareBaseKind,
    normalizedOptions.compareBaseRef,
    normalizedOptions.compareUseMergeBase,
    normalizedOptions.ignoreWhitespaceChanges,
    normalizedOptions.excludePaths,
  );
}

export function startUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string) {
  return getDiffParser().startUnifiedDiffFromUrl(diffUrl, sourceLabel);
}

export function loadUnifiedDiff(diffText: string, sourceLabel: string, initialRowCount = 200, ignoreWhitespaceChanges = false) {
  return getDiffParser().loadUnifiedDiff(diffText, sourceLabel, initialRowCount, ignoreWhitespaceChanges);
}

export function loadUnifiedDiffFile(filePath: string, sourceLabel: string, initialRowCount = 200, ignoreWhitespaceChanges = false) {
  return getDiffParser().loadUnifiedDiffFile(filePath, sourceLabel, initialRowCount, ignoreWhitespaceChanges);
}

export function loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, initialRowCount = 200, ignoreWhitespaceChanges = false) {
  return getDiffParser().loadUnifiedDiffFromUrl(diffUrl, sourceLabel, initialRowCount, ignoreWhitespaceChanges);
}

export const gitHistoryPageSize = 500;

export class GitHistoryCancelledError extends Error {
  constructor() {
    super("History read was cancelled.");
    this.name = "GitHistoryCancelledError";
  }
}

export type GitHistoryReader = {
  readonly head: GitHistoryHead;
  /** Commits from `offset`, in `git log --topo-order` order; rejects with GitHistoryCancelledError once closed or aborted. */
  page(offset: number, count?: number, signal?: AbortSignal): Promise<GitHistoryPage>;
  /** Releases the native walk; idempotent. */
  close(): void;
};

function untilAborted<T>(pending: Promise<T>, signal?: AbortSignal, onAbort?: () => void): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) { onAbort?.(); return Promise.reject(new GitHistoryCancelledError()); }
  return new Promise<T>((resolve, reject) => {
    const abort = () => { onAbort?.(); reject(new GitHistoryCancelledError()); };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Opens a paged native walk of the history of HEAD, or of `startRef` (a full ref name or commit), anchored
 * at the commit read now; `head.headOid` is that commit. Only the pages asked for cross into JS. Aborting
 * `signal` while opening releases the walk.
 */
export async function openGitHistory(folderPath: string, signal?: AbortSignal, startRef = ""): Promise<GitHistoryReader> {
  const parser = getDiffParser();
  const opening = parser.openGitHistory(folderPath, startRef);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    void opening.then(head => parser.closeGitHistory(head.handle), () => {});
  };
  const head = await untilAborted(opening, signal, close);
  return {
    head,
    page(offset, count = gitHistoryPageSize, pageSignal) {
      if (closed) return Promise.reject(new GitHistoryCancelledError());
      const reading = parser.readGitHistoryPage(head.handle, offset, count).catch((error: unknown) => {
        throw closed ? new GitHistoryCancelledError() : error;
      });
      return untilAborted(reading, pageSignal);
    },
    close,
  };
}

/** What a blame is read as of: a commit, the staged contents or the file on disk. */
export type GitBlameSource = string | "index" | "workdir";

export type GitBlameReader = {
  /** Hunks covering `count` lines from `startLine` (1-based); rejects with GitHistoryCancelledError once closed or aborted. */
  lines(startLine: number, count: number, signal?: AbortSignal): Promise<GitBlameHunk[]>;
  /** Releases the native blame; idempotent. */
  close(): void;
};

/**
 * Opens a native blame of `path` as of `source`; lines read from "index" or "workdir" that HEAD does not
 * have come back with an empty `oid` (not committed yet). Aborting `signal` while opening releases it.
 */
export async function openGitBlame(folderPath: string, path: string, source: GitBlameSource, signal?: AbortSignal): Promise<GitBlameReader> {
  const parser = getDiffParser();
  const opening = parser.openGitBlame(folderPath, path, source);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    void opening.then(handle => parser.closeGitBlame(handle), () => {});
  };
  const handle = await untilAborted(opening, signal, close);
  return {
    lines(startLine, count, linesSignal) {
      if (closed) return Promise.reject(new GitHistoryCancelledError());
      const reading = parser.readGitBlame(handle, startLine, count).catch((error: unknown) => {
        throw closed ? new GitHistoryCancelledError() : error;
      });
      return untilAborted(reading, linesSignal, close);
    },
    close,
  };
}

/** The hunk that last changed one line, or null past the end of the file. */
export async function blameLine(folderPath: string, path: string, source: GitBlameSource, line: number, signal?: AbortSignal): Promise<GitBlameHunk | null> {
  const reader = await openGitBlame(folderPath, path, source, signal);
  try {
    return (await reader.lines(line, 1, signal))[0] ?? null;
  } finally { reader.close(); }
}

export { default as DiffNativeRowConfig } from "./DiffNativeRowConfigNativeComponent";
export { default as DiffNativeRow } from "./DiffNativeRowNativeComponent";
export { default as DiffHorizontalScroller } from "./DiffHorizontalScrollerNativeComponent";
export { default as DiffMergeNativePane } from "./DiffMergeNativePaneNativeComponent";

export type {
  DiffDocument,
  DiffFileSummary,
  DiffGitFolderLoadOptions,
  DiffLoadProgress,
  DiffLoadStatus,
  DiffLoadResult,
  DiffLoadSession,
  DiffLoadTiming,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideProjection,
  DiffSideBySideProjectionCommit,
  DiffSideBySideProjectionItem,
  DiffSideBySideProjectionLocation,
  DiffSideBySideRenderRow,
  DiffSyntaxScope,
  DiffSyntaxStyle,
  DiffSyntaxTokenRun,
  DiffTokenizedRowRange,
  GitBlameHunk,
  GitHistoryCommit,
  GitHistoryHead,
  GitHistoryPage,
} from "./DiffParser.nitro";
export * from "./unifiedPatch";
export * from "./diffRowPresentation";
