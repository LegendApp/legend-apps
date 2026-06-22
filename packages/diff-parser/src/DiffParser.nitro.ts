import type { HybridObject } from "react-native-nitro-modules";

export interface DiffFileSummary {
  index: number;
  path: string;
  oldPath: string;
  status: string;
  additions: number;
  deletions: number;
  rowStart: number;
  rowCount: number;
  isBinary: boolean;
}

export interface DiffRenderRow {
  index: number;
  kind: number;
  fileIndex: number;
  hunkIndex: number;
  oldLineNumber: number;
  newLineNumber: number;
  changeType: number;
  text: string;
}

export interface DiffLoadTiming {
  diffMs: number;
  rowCount: number;
  fileCount: number;
}

export interface DiffLoadResult {
  document: DiffDocument;
  files: DiffFileSummary[];
  initialRows: DiffRenderRow[];
  timing: DiffLoadTiming;
}

export interface DiffDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly rowCount: number;
  readonly fileCount: number;
  getRows(start: number, count: number): DiffRenderRow[];
  getFiles(): DiffFileSummary[];
  getTiming(): DiffLoadTiming;
}

export interface DiffParser
  extends HybridObject<{
    ios: "c++";
  }> {
  loadGitFolderDiff(folderPath: string, initialRowCount: number): Promise<DiffLoadResult>;
}
