import { normalizeStoryDiff, storyHash } from "./storyHash";

// diff-parser's DiffChangeType values; this package stays free of the native module.
const diffChangeTypeAdd = 1;
const diffChangeTypeRemove = 2;

export type StorySource = { type: "working_tree" | "git_range" | "pull_request" | "commit" | "patch"; base?: string; head?: string };

// Structural subsets of diff-parser's DiffFileSummary/DiffRenderRow/DiffDocument, so the
// native document and a headless parser's output feed the same algorithm.
export type StoryDiffFile = {
  index: number; path: string; oldPath: string; status: string; additions: number; deletions: number;
  rowStart: number; rowCount: number; isBinary: boolean;
};
export type StoryDiffRow = {
  index: number; kind: number; fileIndex: number; hunkIndex: number; oldLineNumber: number; newLineNumber: number; changeType: number; text: string;
};
export type StoryDiffDocument = { getFiles(): StoryDiffFile[]; getPlainRows(start: number, count: number): StoryDiffRow[] };

export type StoryHunk = {
  id: string; hash: string; file: string; fileIndex: number; hunkIndex: number;
  oldStart: number; oldLines: number; newStart: number; newLines: number;
  rowStart: number; rowCount: number; text: string; rows: StoryDiffRow[];
};
export type StoryFile = { file: StoryDiffFile; classification: "source" | "generated" | "lockfile" | "vendored"; hunks: StoryHunk[]; text: string };
export type StoryInput = {
  diffHash: string; source: StorySource; hunks: StoryHunk[]; files: StoryFile[]; diffText: string;
};

export function classifyStoryFile(path: string): StoryFile["classification"] {
  if (/(^|\/)(vendor|vendored|third-party|third_party|node_modules)\//i.test(path)) return "vendored";
  if (/(^|\/)([^/]*\.lockb?|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|Podfile\.lock|Cargo\.lock|Gemfile\.lock|Package\.resolved)$/i.test(path)) return "lockfile";
  if (/(^|\/)(__generated__|generated|nitrogen\/generated)\/|\.(generated|g)\.[^/]+$|\.min\.[^/]+$|\.map$/i.test(path)) return "generated";
  return "source";
}

export function storyRowText(row: StoryDiffRow) {
  if (row.oldLineNumber < 0 && row.newLineNumber < 0) return "\\ No newline at end of file";
  return `${row.changeType === diffChangeTypeAdd ? "+" : row.changeType === diffChangeTypeRemove ? "-" : " "}${row.text.replace(/\r$/, "")}`;
}

function lineRange(rows: StoryDiffRow[], side: "old" | "new", lineOffset: number) {
  const lineNumbers = rows.map(row => side === "old" ? row.oldLineNumber : row.newLineNumber).filter(line => line > 0);
  const otherStart = rows.find(row => (side === "old" ? row.newLineNumber : row.oldLineNumber) > 0);
  return { start: lineNumbers[0] ?? Math.max(0, (otherStart ? side === "old" ? otherStart.newLineNumber - lineOffset : otherStart.oldLineNumber + lineOffset : 1) - 1), lines: lineNumbers.length };
}

const quoteEscapes: Record<string, string> = { "\\": "\\\\", "\"": "\\\"", "\n": "\\n", "\t": "\\t" };
/** C-quotes a raw (unescaped) path the way Git does. */
export const quoteStoryPath = (path: string) => `"${path.replace(/[\\"\n\t]/g, char => quoteEscapes[char])}"`;
/** Wraps a path in quotes as-is, for parser paths that are already escaped. */
export const wrapStoryPath = (path: string) => `"${path}"`;

export type StoryInputOptions = {
  /** Quotes a/ and b/ paths in the canonical diff text. Changing it changes every diffHash, and with it cache identity. */
  quotePath: (path: string) => string;
  /** Leaves matching files out of the input entirely. */
  excludePath?: (path: string) => boolean;
};

export function buildStoryInput(document: StoryDiffDocument, source: StorySource, options: StoryInputOptions): StoryInput {
  const { quotePath, excludePath } = options;
  const hunks: StoryHunk[] = [];
  const files = document.getFiles().filter(file => !excludePath?.(file.path)).map((file): StoryFile => {
    const fileHunks: StoryHunk[] = [];
    let rows: StoryDiffRow[] = [];
    let lineOffset = 0;
    function append(rows: StoryDiffRow[]) {
      const old = lineRange(rows, "old", lineOffset), next = lineRange(rows, "new", lineOffset);
      lineOffset = next.start + Math.max(0, next.lines - 1) - old.start - Math.max(0, old.lines - 1);
      const text = `@@ -${old.start},${old.lines} +${next.start},${next.lines} @@\n${rows.map(storyRowText).join("\n")}\n`;
      const hunk: StoryHunk = { id: `h${hunks.length + 1}`, hash: storyHash(`${file.oldPath}\n${file.path}\n${rows.map(storyRowText).join("\n")}`),
        file: file.path, fileIndex: file.index, hunkIndex: rows[0].hunkIndex, oldStart: old.start, oldLines: old.lines, newStart: next.start, newLines: next.lines,
        rowStart: rows[0].index, rowCount: rows.length, text, rows };
      fileHunks.push(hunk); hunks.push(hunk);
    }
    function flush() {
      let start = -1, end = 0;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.changeType !== diffChangeTypeAdd && row.changeType !== diffChangeTypeRemove && (row.oldLineNumber >= 0 || row.newLineNumber >= 0)) continue;
        if (start >= 0 && index - 3 > end) { append(rows.slice(start, end)); start = -1; }
        if (start < 0) start = Math.max(0, index - 3);
        end = Math.min(rows.length, index + 4);
      }
      if (start >= 0) append(rows.slice(start, end));
      rows = [];
    }
    for (let offset = file.rowStart; offset < file.rowStart + file.rowCount; offset += 1024) {
      for (const row of document.getPlainRows(offset, Math.min(1024, file.rowStart + file.rowCount - offset))) {
        if (row.kind !== 2 || row.hunkIndex < 0) continue;
        if (rows.length && rows[0].hunkIndex !== row.hunkIndex) flush();
        rows.push(row);
      }
    }
    flush();
    const oldPath = quotePath(`a/${file.oldPath || file.path}`), newPath = quotePath(`b/${file.path}`);
    const metadata = file.status === "renamed" || file.status === "copied" ? `${file.status === "renamed" ? "rename" : "copy"} from ${quotePath(file.oldPath)}\n${file.status === "renamed" ? "rename" : "copy"} to ${quotePath(file.path)}\n` : "";
    const text = `diff --git ${oldPath} ${newPath}\n${metadata}--- ${file.status === "added" || file.status === "untracked" ? "/dev/null" : oldPath}\n+++ ${file.status === "deleted" ? "/dev/null" : newPath}\n${file.isBinary ? "Binary files differ\n" : fileHunks.map(hunk => hunk.text).join("")}`;
    return { file, classification: classifyStoryFile(file.path), hunks: fileHunks, text };
  });
  const diffText = normalizeStoryDiff(files.map(file => file.text).join(""));
  return { diffHash: `sha256:${storyHash(diffText)}`, source, hunks, files, diffText };
}

export function storyInputContext(input: StoryInput) {
  return { diffHash: input.diffHash, source: input.source, hunks: input.hunks.map(({ id, hash, file, oldStart, oldLines, newStart, newLines }) => ({ id, hash, file, oldStart, oldLines, newStart, newLines })) };
}

/** The parser-derived identity of a StoryInput, compared byte for byte across the native UI and the headless helper. */
export function storyInputSnapshot(input: StoryInput) {
  const changed = (rows: StoryDiffRow[]) => rows.filter(row => row.changeType === diffChangeTypeAdd || row.changeType === diffChangeTypeRemove).length;
  return {
    diffHash: input.diffHash, source: input.source,
    coverage: { files: input.files.length, hunks: input.hunks.length, hunkRows: input.hunks.reduce((sum, hunk) => sum + hunk.rowCount, 0),
      changedRows: input.hunks.reduce((sum, hunk) => sum + changed(hunk.rows), 0),
      changeCounts: input.files.reduce((sum, file) => sum + file.file.additions + file.file.deletions, 0) },
    files: input.files.map(({ file, classification, hunks }) => ({ index: file.index, path: file.path, oldPath: file.oldPath, status: file.status,
      isBinary: file.isBinary, additions: file.additions, deletions: file.deletions, classification, hunks: hunks.map(hunk => hunk.id) })),
    hunks: input.hunks.map(({ id, hash, file, fileIndex, hunkIndex, oldStart, oldLines, newStart, newLines, rowStart, rowCount }) =>
      ({ id, hash, file, fileIndex, hunkIndex, oldStart, oldLines, newStart, newLines, rowStart, rowCount })),
    diffText: input.diffText,
  };
}
