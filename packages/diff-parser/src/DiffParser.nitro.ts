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
  scopeId: number;
}

export interface DiffSyntaxScope {
  id: number;
  scopes: string[];
}

export interface DiffSyntaxStyle {
  scopeId: number;
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

export interface DiffCachedRow {
  plain: DiffRenderRow;
  tokens: DiffSyntaxTokenRun[] | null;
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
  fetchMs: number;
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
  scopes: DiffSyntaxScope[];
  timing: DiffLoadTiming;
}

export interface DiffLoadProgress {
  document: DiffDocument;
  files: DiffFileSummary[];
  initialRows: DiffRenderRow[];
  scopes: DiffSyntaxScope[];
  timing: DiffLoadTiming;
  rowCount: number;
  fileCount: number;
  rowVersion: number;
  fileVersion: number;
  complete: boolean;
  cancelled: boolean;
  error: string;
}

export interface DiffGitFolderLoadOptions {
  compareBaseKind: string;
  compareBaseRef: string;
  compareUseMergeBase: boolean;
  showOnlyHunks: boolean;
}

export interface DiffDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly rowCount: number;
  readonly fileCount: number;
  readonly tokenizedMaxRow: number;
  readonly scopeCount: number;
  readonly documentId: number;
  getRow(index: number): DiffCachedRow;
  getPlainRows(start: number, count: number): DiffRenderRow[];
  getRows(start: number, count: number): DiffRenderRow[];
  getHunkRowIndexes(): number[];
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
  getScopes(): DiffSyntaxScope[];
  getScopeStyles(themeName: string, fromScopeId: number): DiffSyntaxStyle[];
  getTiming(): DiffLoadTiming;
  requestTokenizedRows(start: number, count: number, reason: string): number;
  requestTokenizedSideBySideRows(start: number, count: number, collapsedFileIndexes: number[], reason: string): number;
  requestTokenizedFiles(fileIndexes: number[], reason: string): number;
  cancelTokenizationRequests(reason: string): number;
  releaseNativeResources(): number;
  startBackgroundTokenization(chunkRowCount: number, chunkBudgetMs: number, maxRowCount: number, maxSourceLineCount: number): number;
  stopBackgroundTokenization(): number;
}

export interface DiffLoadSession
  extends HybridObject<{
    ios: "c++";
  }> {
  getDocument(): DiffDocument;
  consumeChanges(initialRowCount: number): DiffLoadProgress;
  cancel(): number;
}

export interface DiffParser
  extends HybridObject<{
    ios: "c++";
  }> {
  logTimingMark(message: string): number;
  startGitFolderDiff(folderPath: string, showOnlyHunks: boolean, compareBaseKind: string, compareBaseRef: string, compareUseMergeBase: boolean): DiffLoadSession;
  startUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string): DiffLoadSession;
  loadGitFolderDiff(folderPath: string, initialRowCount: number, showOnlyHunks: boolean, compareBaseKind: string, compareBaseRef: string, compareUseMergeBase: boolean): Promise<DiffLoadResult>;
  loadUnifiedDiff(diffText: string, sourceLabel: string, initialRowCount: number): Promise<DiffLoadResult>;
  loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, initialRowCount: number): Promise<DiffLoadResult>;
}
