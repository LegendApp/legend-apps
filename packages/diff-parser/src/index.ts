import { NitroModules } from "react-native-nitro-modules";
import type { DiffParser } from "./DiffParser.nitro";

let diffParser: DiffParser | undefined;

function getDiffParser() {
  diffParser ??= NitroModules.createHybridObject<DiffParser>("DiffParser");
  return diffParser;
}

export function loadGitFolderDiff(folderPath: string, initialRowCount = 200) {
  return getDiffParser().loadGitFolderDiff(folderPath, initialRowCount);
}

export function loadUnifiedDiff(diffText: string, sourceLabel: string, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiff(diffText, sourceLabel, initialRowCount);
}

export function loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiffFromUrl(diffUrl, sourceLabel, initialRowCount);
}

export type {
  DiffDocument,
  DiffFileSummary,
  DiffLoadResult,
  DiffLoadTiming,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideRenderRow,
  DiffSyntaxScope,
  DiffSyntaxStyle,
  DiffSyntaxTokenRun,
  DiffTokenizedRowRange,
} from "./DiffParser.nitro";
