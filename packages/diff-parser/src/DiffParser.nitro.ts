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

export interface DiffSideBySideProjectionSplice {
  index: number;
  deleteCount: number;
  insertCount: number;
}

export interface DiffSideBySideProjectionCommit {
  changed: boolean;
  previousRevision: number;
  revision: number;
  previousLength: number;
  length: number;
  splices: DiffSideBySideProjectionSplice[];
}

export interface DiffSideBySideProjectionItem {
  itemId: number;
  kind: string;
  fileIndex: number;
  hunkIndex: number;
  sourceStart: number;
  sourceEnd: number;
  hunkStart: boolean;
}

export interface DiffSideBySideProjectionLocation {
  listIndex: number;
  itemId: number;
  fileIndex: number;
  collapsed: boolean;
  exact: boolean;
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

export interface DiffLoadStatus {
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
  ignoreWhitespaceChanges: boolean;
  showOnlyHunks: boolean;
  /** Repo-relative path prefixes to leave out, matched on whole path segments: ".review" excludes ".review/x" but not ".reviewer". */
  excludePaths?: string[];
}

export interface GitHistoryCommit {
  oid: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Author time, in seconds since the epoch. */
  time: number;
  /** The first line of the message. */
  summary: string;
  /** Graph column of the commit's node; 12 stands for every column past the cap. */
  lane: number;
  /** Color index of the commit's lane. */
  color: number;
  /**
   * The row's graph segments as (top, bottom, color) triples: the column a segment enters at the top
   * edge and leaves at the bottom edge, with -1 for the commit's node. Top equal to bottom passes through.
   */
  edges: number[];
}

export interface GitHistoryHead {
  handle: number;
  headOid: string;
  unborn: boolean;
  detached: boolean;
}

export interface GitHistoryPage {
  offset: number;
  commits: GitHistoryCommit[];
  /** No commits follow this page. */
  done: boolean;
}

/** Lines of a blamed file that last changed in one commit, or that are not committed yet. */
export interface GitBlameHunk {
  /** The commit that last changed these lines; empty when they are not committed yet. */
  oid: string;
  /** The file's path in that commit (it differs after a rename). */
  path: string;
  /** First line of the hunk in the blamed file, 1-based. */
  startLine: number;
  /** First line of the hunk in `path` as of `oid`. */
  originalStartLine: number;
  lineCount: number;
  authorName: string;
  authorEmail: string;
  /** Author time, in seconds since the epoch. */
  time: number;
  summary: string;
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
  createSideBySideProjection(collapsedFileIndexes: number[]): DiffSideBySideProjection;
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
  getMissingSyntaxLanguages(): string[];
  refreshSyntaxGrammars(): void;
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

export interface DiffSideBySideProjection
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly projectionId: number;
  readonly revision: number;
  readonly rowCount: number;
  readonly documentGeneration: number;
  setFileCollapsed(fileIndex: number, collapsed: boolean): DiffSideBySideProjectionCommit;
  refresh(): DiffSideBySideProjectionCommit;
  isFileCollapsed(fileIndex: number): boolean;
  getItemId(index: number): number;
  getItem(itemId: number): DiffSideBySideProjectionItem;
  getFileLocation(fileIndex: number): DiffSideBySideProjectionLocation;
  getItemLocation(itemId: number): DiffSideBySideProjectionLocation;
  getSourceLocation(sourceRowIndex: number): DiffSideBySideProjectionLocation;
  getHunkLocations(): DiffSideBySideProjectionLocation[];
  getPlainRowForItem(itemId: number, listIndex: number): DiffSideBySideRenderRow;
  getRowForItem(itemId: number, listIndex: number): DiffSideBySideRenderRow;
  getPlainRows(start: number, count: number): DiffSideBySideRenderRow[];
  getRows(start: number, count: number): DiffSideBySideRenderRow[];
  requestTokenizedRows(start: number, count: number, reason: string): number;
  releaseNativeResources(): number;
}

export interface DiffLoadSession
  extends HybridObject<{
    ios: "c++";
  }> {
  getDocument(): DiffDocument;
  getProgress(): DiffLoadStatus;
  consumeChanges(initialRowCount: number): DiffLoadProgress;
  cancel(): number;
}

export interface DiffParser
  extends HybridObject<{
    ios: "c++";
  }> {
  startGitFolderDiff(folderPath: string, showOnlyHunks: boolean, compareBaseKind: string, compareBaseRef: string, compareUseMergeBase: boolean, ignoreWhitespaceChanges: boolean, excludePaths: string[]): DiffLoadSession;
  startUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string): DiffLoadSession;
  loadGitFolderDiff(folderPath: string, initialRowCount: number, showOnlyHunks: boolean, compareBaseKind: string, compareBaseRef: string, compareUseMergeBase: boolean, ignoreWhitespaceChanges: boolean, excludePaths: string[]): Promise<DiffLoadResult>;
  loadUnifiedDiff(diffText: string, sourceLabel: string, initialRowCount: number, ignoreWhitespaceChanges: boolean): Promise<DiffLoadResult>;
  loadUnifiedDiffFile(filePath: string, sourceLabel: string, initialRowCount: number, ignoreWhitespaceChanges: boolean): Promise<DiffLoadResult>;
  loadUnifiedDiffFromUrl(diffUrl: string, sourceLabel: string, initialRowCount: number, ignoreWhitespaceChanges: boolean): Promise<DiffLoadResult>;
  /** Opens a paged walk of HEAD's history; release it with closeGitHistory. */
  openGitHistory(folderPath: string): Promise<GitHistoryHead>;
  readGitHistoryPage(handle: number, offset: number, count: number): Promise<GitHistoryPage>;
  /** Releases the walk; a page still being read fails as cancelled. */
  closeGitHistory(handle: number): void;
  /**
   * Opens a blame of `path` as of `source`: a commit, "index" or "workdir" (lines not in HEAD are not
   * committed yet). Release it with closeGitBlame.
   */
  openGitBlame(folderPath: string, path: string, source: string): Promise<number>;
  /** Hunks covering `lineCount` lines from `startLine` (1-based), clipped to the file. */
  readGitBlame(handle: number, startLine: number, lineCount: number): Promise<GitBlameHunk[]>;
  /** Releases the blame; a read still running fails as cancelled. */
  closeGitBlame(handle: number): void;
}
