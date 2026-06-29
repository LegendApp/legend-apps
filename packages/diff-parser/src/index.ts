import { NitroModules } from "react-native-nitro-modules";
import type { DiffGitFolderLoadOptions, DiffParser } from "./DiffParser.nitro";

let diffParser: DiffParser | undefined;

function getDiffParser() {
  diffParser ??= NitroModules.createHybridObject<DiffParser>("DiffParser");
  return diffParser;
}

function normalizeGitFolderLoadOptions(options?: Partial<DiffGitFolderLoadOptions>): DiffGitFolderLoadOptions {
  return {
    showOnlyHunks: options?.showOnlyHunks ?? true,
  };
}

export function loadGitFolderDiff(folderPath: string, initialRowCount = 200, options?: Partial<DiffGitFolderLoadOptions>) {
  const normalizedOptions = normalizeGitFolderLoadOptions(options);
  return getDiffParser().loadGitFolderDiff(folderPath, initialRowCount, normalizedOptions.showOnlyHunks);
}

export function startGitFolderDiff(folderPath: string, options?: Partial<DiffGitFolderLoadOptions>) {
  const normalizedOptions = normalizeGitFolderLoadOptions(options);
  return getDiffParser().startGitFolderDiff(folderPath, normalizedOptions.showOnlyHunks);
}

export function logDiffTimingMark(message: string) {
  try {
    getDiffParser().logTimingMark(message);
  } catch {
    // Timing diagnostics must not affect app startup or rendering.
  }
}

export function loadUnifiedDiff(diffText: string, sourceLabel: string, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiff(diffText, sourceLabel, initialRowCount);
}

export function loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiffFromUrl(diffUrl, sourceLabel, initialRowCount);
}

export { default as DiffNativeRowConfig } from "./DiffNativeRowConfigNativeComponent";
export { default as DiffNativeRow } from "./DiffNativeRowNativeComponent";

export type {
  DiffDocument,
  DiffFileSummary,
  DiffGitFolderLoadOptions,
  DiffLoadProgress,
  DiffLoadResult,
  DiffLoadSession,
  DiffLoadTiming,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideRenderRow,
  DiffSyntaxScope,
  DiffSyntaxStyle,
  DiffSyntaxTokenRun,
  DiffTokenizedRowRange,
} from "./DiffParser.nitro";
