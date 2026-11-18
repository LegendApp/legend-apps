import { diffUnifiedChangeBarWidth, diffUnifiedLineNumberWidth, diffUnifiedMarkerWidth, type DiffRenderRow, type DiffSideBySideRenderRow } from "@legend-apps/diff-parser";
import type { Density, PanelOptions } from "./settings/schema";
import { diffLineHeight, type Appearance, type ResolvedTheme } from "./settings/theme";

export type DiffOptions = PanelOptions["diff"];

/** Git writes three lines of context; fewer are trimmed from its patch here, more would need Git to run again. */
export const gitContextLines = 3;

/** Side by side draws old | new columns (diff-parser's side-by-side projection); "horizontal" is old above new, which is the unified order. */
export const sideBySideColumns = (options: Pick<DiffOptions, "mode" | "sideBySideSplit">) => options.mode === "sideBySide" && options.sideBySideSplit === "vertical";

/**
 * Everything the pane's one `DiffNativeRowConfig` takes from settings (spec §7 item 4): a diff option, theme or density
 * change is one native prop update, and the rows redraw natively without rendering.
 */
export function diffConfigProps({ options, density, tokens, font, appearance }: {
  options: DiffOptions; density: Density; tokens: ResolvedTheme["diff"]; font: { family: string; size: number }; appearance: Appearance;
}) {
  const columns = sideBySideColumns(options);
  return {
    presentation: columns ? "blocks" : "unified",
    rowHeight: diffLineHeight(density, font.size),
    fontFamily: font.family,
    fontSize: font.size,
    foregroundColor: appearance === "dark" ? "#e6edf3" : "#1f2328",
    mutedColor: tokens.gutter,
    addAccentColor: tokens.addedWord,
    addBackgroundColor: tokens.addedLine,
    removeAccentColor: tokens.removedWord,
    removeBackgroundColor: tokens.removedLine,
    changeBarWidth: columns ? 0 : diffUnifiedChangeBarWidth,
    // The native rows draw both numbers in one gutter; "new" keeps it (a new-only gutter is a diff-parser ask).
    lineNumberWidth: options.lineNumbers === "none" ? 0 : diffUnifiedLineNumberWidth,
    markerWidth: diffUnifiedMarkerWidth,
    showWhitespaceCharacters: options.showWhitespace,
  } as const;
}

/**
 * A one-file patch with at most `context` unchanged lines around each change, its hunks split where more than twice
 * that many separate two changes. Changed lines keep their line numbers, so their keys still stage against the
 * original patch.
 */
export function withContextLines(text: string, context: number): string {
  if (context >= gitContextLines) return text;
  const lines = text.split("\n");
  const trailing = lines.at(-1) === "" ? lines.pop() : undefined;
  const out: string[] = [];
  let index = 0;
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
  while (index < lines.length) {
    const match = header.exec(lines[index]!);
    if (!match) { out.push(lines[index]!); index += 1; continue; }
    index += 1;
    // The hunk's body lines with their old/new numbers; "\" markers stay attached to the line before them.
    const body: { kind: string; line: string; marker?: string; oldLine: number; newLine: number }[] = [];
    let oldLine = Number(match[1]), newLine = Number(match[3]);
    while (index < lines.length && /^[ +\-\\]/.test(lines[index]!)) {
      const line = lines[index]!;
      if (line.startsWith("\\")) { const last = body.at(-1); if (last) last.marker = line; index += 1; continue; }
      body.push({ kind: line[0]!, line, oldLine, newLine });
      if (line[0] !== "+") oldLine += 1;
      if (line[0] !== "-") newLine += 1;
      index += 1;
    }
    const changed = body.map(entry => entry.kind !== " ");
    const keep = body.map((_, at) => {
      if (changed[at]) return true;
      for (let distance = 1; distance <= context; distance += 1) if (changed[at - distance] || changed[at + distance]) return true;
      return false;
    });
    let start = 0, section = match[5];
    while (start < body.length) {
      if (!keep[start]) { start += 1; continue; }
      let end = start;
      while (end + 1 < body.length && keep[end + 1]) end += 1;
      const slice = body.slice(start, end + 1);
      const oldCount = slice.filter(entry => entry.kind !== "+").length, newCount = slice.filter(entry => entry.kind !== "-").length;
      const first = slice[0]!;
      // Git writes an empty side's start as the line before it.
      const oldStart = oldCount ? first.oldLine : first.oldLine - 1, newStart = newCount ? first.newLine : first.newLine - 1;
      out.push(`@@ -${oldStart}${oldCount === 1 ? "" : `,${oldCount}`} +${newStart}${newCount === 1 ? "" : `,${newCount}`} @@${section}`);
      section = "";
      for (const entry of slice) { out.push(entry.line); if (entry.marker) out.push(entry.marker); }
      start = end + 1;
    }
  }
  if (trailing !== undefined) out.push(trailing);
  return out.join("\n");
}

const changeKind: Record<number, "+" | "-"> = { 1: "+", 2: "-" };
const sideKey = (row: DiffRenderRow) => { const kind = changeKind[row.changeType]; return kind ? `${kind}${kind === "-" ? row.oldLineNumber : row.newLineNumber}` : null; };

/** A side-by-side row's primary line (the new side when it has one) and the changed-line keys of both sides. */
export function sideBySideLine(row: DiffSideBySideRenderRow) {
  const primary = row.newRowVisible ? row.newRow : row.oldRow;
  const keys = [row.oldRowVisible ? sideKey(row.oldRow) : null, row.newRowVisible && !row.newRowEqualsOldRow ? sideKey(row.newRow) : null].filter((key): key is string => !!key);
  return { primary, keys: [...new Set(keys)] };
}
