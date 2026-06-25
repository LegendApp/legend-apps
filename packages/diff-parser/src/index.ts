import { NitroModules } from "react-native-nitro-modules";
import type { DiffParser } from "./DiffParser.nitro";

let diffParser: DiffParser | undefined;
const defaultSyntaxThemeName = "github-dark-dimmed";

function getDiffParser() {
  diffParser ??= NitroModules.createHybridObject<DiffParser>("DiffParser");
  return diffParser;
}

export function loadGitFolderDiff(folderPath: string, theme = defaultSyntaxThemeName, initialRowCount = 200) {
  return getDiffParser().loadGitFolderDiff(folderPath, theme, initialRowCount);
}

export function loadUnifiedDiff(diffText: string, sourceLabel: string, theme = defaultSyntaxThemeName, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiff(diffText, sourceLabel, theme, initialRowCount);
}

export function loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, theme = defaultSyntaxThemeName, initialRowCount = 200) {
  return getDiffParser().loadUnifiedDiffFromUrl(diffUrl, sourceLabel, theme, initialRowCount);
}

export type {
  DiffDocument,
  DiffFileSummary,
  DiffLoadResult,
  DiffLoadTiming,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideRenderRow,
  DiffSyntaxStyle,
  DiffSyntaxTokenRun,
  DiffTokenizedRowRange,
} from "./DiffParser.nitro";
