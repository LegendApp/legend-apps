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

export interface DiffSyntaxTokenRun {
  startColumn: number;
  length: number;
  styleId: number;
}

export interface DiffSyntaxStyle {
  id: number;
  foreground: string;
  fontStyle: number;
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
  tokens: DiffSyntaxTokenRun[];
}

export interface DiffSideBySideFileHeader {
  fileIndex: number;
  sourceStart: number;
  listIndex: number;
}

export interface DiffSideBySideRenderRow {
  index: number;
  kind: string;
  fileIndex: number;
  hunkIndex: number;
  sourceStart: number;
  sourceEnd: number;
  oldRowVisible: boolean;
  newRowVisible: boolean;
  newRowEqualsOldRow: boolean;
  oldRow: DiffRenderRow;
  newRow: DiffRenderRow;
}

export interface DiffTokenizedRowRange {
  start: number;
  end: number;
}

export interface DiffLoadTiming {
  diffMs: number;
  openRepoMs: number;
  createDiffMs: number;
  walkDiffMs: number;
  documentMs: number;
  copyFilesMs: number;
  copyInitialRowsMs: number;
  nativeTotalMs: number;
  rowCount: number;
  fileCount: number;
}

export interface DiffLoadResult {
  document: DiffDocument;
  files: DiffFileSummary[];
  initialRows: DiffRenderRow[];
  styles: DiffSyntaxStyle[];
  timing: DiffLoadTiming;
}

export interface DiffDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly rowCount: number;
  readonly fileCount: number;
  getPlainRows(start: number, count: number): DiffRenderRow[];
  getRows(start: number, count: number): DiffRenderRow[];
  getSideBySideRowCount(collapsedFileIndexes: number[]): number;
  getSideBySideFileHeaders(collapsedFileIndexes: number[]): DiffSideBySideFileHeader[];
  getSideBySideListIndexForSourceRow(sourceRowIndex: number, collapsedFileIndexes: number[]): number;
  getPlainSideBySideRow(index: number, collapsedFileIndexes: number[]): DiffSideBySideRenderRow;
  getSideBySideRow(index: number, collapsedFileIndexes: number[]): DiffSideBySideRenderRow;
  getPlainSideBySideRows(start: number, count: number, collapsedFileIndexes: number[]): DiffSideBySideRenderRow[];
  getSideBySideRows(start: number, count: number, collapsedFileIndexes: number[]): DiffSideBySideRenderRow[];
  getTokenizedRowVersion(): number;
  consumeTokenizedRowRanges(): DiffTokenizedRowRange[];
  getFiles(): DiffFileSummary[];
  getStyles(): DiffSyntaxStyle[];
  getTiming(): DiffLoadTiming;
  startBackgroundTokenization(chunkRowCount: number, chunkBudgetMs: number): number;
  stopBackgroundTokenization(): number;
}

export interface DiffParser
  extends HybridObject<{
    ios: "c++";
  }> {
  loadGitFolderDiff(folderPath: string, theme: string, initialRowCount: number): Promise<DiffLoadResult>;
  loadUnifiedDiff(diffText: string, sourceLabel: string, theme: string, initialRowCount: number): Promise<DiffLoadResult>;
}
