import { NitroModules } from "react-native-nitro-modules";
import type { DiffGitFolderLoadOptions, DiffParser } from "./DiffParser.nitro";

let diffParser: DiffParser | undefined;

function getDiffParser() {
  diffParser ??= NitroModules.createHybridObject<DiffParser>("DiffParser");
  return diffParser;
}

function normalizeGitFolderLoadOptions(options?: Partial<DiffGitFolderLoadOptions>): DiffGitFolderLoadOptions {
  return {
    compareBaseKind: options?.compareBaseKind ?? "head",
    compareBaseRef: options?.compareBaseRef ?? "",
    compareUseMergeBase: options?.compareUseMergeBase ?? true,
    ignoreWhitespaceChanges: options?.ignoreWhitespaceChanges ?? false,
    showOnlyHunks: options?.showOnlyHunks ?? true,
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
} from "./DiffParser.nitro";
