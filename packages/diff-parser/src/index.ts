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

export type {
  DiffDocument,
  DiffFileSummary,
  DiffLoadResult,
  DiffLoadTiming,
  DiffRenderRow,
} from "./DiffParser.nitro";
