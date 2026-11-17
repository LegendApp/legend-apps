import type { UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import type { ReviewSide, ReviewThread } from "./github";

/** A diff line as GitHub addresses it: `R:12` is line 12 of the new side (added or context), `L:7` line 7 of the old side (removed or context). */
export type AnchorKey = `${"L" | "R"}:${number}`;
export const anchorKey = (side: ReviewSide, line: number): AnchorKey => `${side === "LEFT" ? "L" : "R"}:${line}`;

/** The keys a diff row answers to: a context line is on both sides. `changeType` 1 = added, 2 = removed, else context. */
export function rowAnchorKeys(row: { changeType: number; oldLineNumber: number; newLineNumber: number }): AnchorKey[] {
  const keys: AnchorKey[] = [];
  if (row.changeType !== 1 && row.oldLineNumber > 0) keys.push(anchorKey("LEFT", row.oldLineNumber));
  if (row.changeType !== 2 && row.newLineNumber > 0) keys.push(anchorKey("RIGHT", row.newLineNumber));
  return keys;
}

/** Every key the file's hunks show. */
export function patchAnchorKeys(file: UnifiedPatchFile | null) {
  const keys = new Set<AnchorKey>();
  for (const hunk of file?.hunks ?? []) for (const line of hunk.lines) {
    for (const key of rowAnchorKeys({ changeType: line.kind === "+" ? 1 : line.kind === "-" ? 2 : 0, oldLineNumber: line.oldLine, newLineNumber: line.newLine })) keys.add(key);
  }
  return keys;
}

/**
 * Places one file's threads on its diff: a current thread sits under its last line (`line` on `side`, as GitHub shows
 * it). Threads that are outdated, on the whole file, or on a line the hunks don't show are `unplaced` (listed above the
 * diff, never dropped). Threads keep GitHub's order.
 */
export function placeThreads(threads: readonly ReviewThread[], path: string, file: UnifiedPatchFile | null) {
  const keys = patchAnchorKeys(file);
  const byKey = new Map<AnchorKey, ReviewThread[]>();
  const unplaced: ReviewThread[] = [];
  for (const thread of threads) {
    if (thread.path !== path) continue;
    const key = !thread.outdated && thread.line !== null ? anchorKey(thread.side, thread.line) : null;
    if (key && keys.has(key)) byKey.set(key, [...byKey.get(key) ?? [], thread]);
    else unplaced.push(thread);
  }
  return { byKey, unplaced };
}

/** Comment counts per path, for the files list. */
export function commentCounts(threads: readonly ReviewThread[] | null) {
  const counts = new Map<string, number>();
  for (const thread of threads ?? []) counts.set(thread.path, (counts.get(thread.path) ?? 0) + thread.comments.length);
  return counts;
}

/** "Line 12", or "Lines 10–12" for a range (old-side numbers say "old"). */
export function threadLines(thread: ReviewThread) {
  const line = thread.line ?? thread.originalLine;
  if (line === null) return "File";
  const old = thread.side === "LEFT" ? " (old)" : "";
  return thread.startLine !== null && thread.startLine !== line ? `Lines ${thread.startLine}–${line}${old}` : `Line ${line}${old}`;
}

/** What Add Comment… sends for a selection: the first and last selected lines (each `{side, line}`), in diff order. */
export function commentRange(start: { side: ReviewSide; line: number }, end: { side: ReviewSide; line: number }) {
  return start.side === end.side && start.line === end.line ? { line: end.line, side: end.side } : { line: end.line, side: end.side, startLine: start.line, startSide: start.side };
}
