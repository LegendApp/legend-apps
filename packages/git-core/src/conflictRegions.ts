/**
 * One conflict in a worktree file, as Git writes it: `<<<<<<< ours`, ours' lines, an optional `||||||| base` section (diff3
 * and zdiff3), `=======`, theirs' lines, `>>>>>>> theirs`. Lines are 0-based indexes into the file's lines; `end` is
 * exclusive. Text lines have no line terminator.
 */
export type ConflictRegion = {
  start: number; end: number;
  ours: string[]; base: string[] | null; theirs: string[];
  oursLabel: string; baseLabel: string | null; theirsLabel: string;
};

/** A conflicted file's text and its regions; `regions` is null when the markers don't form well-nested regions. */
export type GitConflictRegions = { text: string; regions: ConflictRegion[] | null };

export type ConflictRegionSide = "ours" | "theirs" | "both";

/** The file's lines, each with its terminator (`\n` or `\r\n`); the last may have none. */
const splitLines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const bare = (line: string) => line.replace(/\r?\n$/, "");

/**
 * The marker a line is, with its label, or null. A marker is `size` (Git's conflict-marker-size, 7 by default) of one
 * character, then a space and a label or the line's end; the separator has no label.
 */
function marker(line: string, size: number) {
  const match = new RegExp(`^(<{${size}}|\\|{${size}}|={${size}}|>{${size}})(?: (.*))?$`).exec(bare(line));
  if (!match || (match[1]![0] === "=" && match[2] !== undefined)) return null;
  return { kind: match[1]![0] as "<" | "|" | "=" | ">", label: match[2] ?? "" };
}

type Parsed = ConflictRegion & { oursAt: [number, number]; theirsAt: [number, number] };

function parse(lines: readonly string[], size: number): Parsed[] | null {
  const regions: Parsed[] = [];
  let open: { start: number; label: string; base: number | null; baseLabel: string | null; split: number | null } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const found = marker(lines[index]!, size);
    if (!found) continue;
    if (!open) {
      // Outside a region only an opening marker counts; a stray `=======` is content (a Setext heading, say).
      if (found.kind === "<") open = { start: index, label: found.label, base: null, baseLabel: null, split: null };
      else if (found.kind === ">") return null;
      continue;
    }
    if (found.kind === "<") return null;
    if (found.kind === "|") {
      if (open.base !== null || open.split !== null) return null;
      open.base = index; open.baseLabel = found.label;
    } else if (found.kind === "=") {
      // A second separator is a content line on one side or the other, so where the sides split is ambiguous.
      if (open.split !== null) return null;
      open.split = index;
    } else {
      if (open.split === null) return null;
      const oursEnd = open.base ?? open.split;
      const text = (from: number, to: number) => lines.slice(from, to).map(bare);
      regions.push({
        start: open.start, end: index + 1,
        ours: text(open.start + 1, oursEnd), base: open.base === null ? null : text(open.base + 1, open.split), theirs: text(open.split + 1, index),
        oursLabel: open.label, baseLabel: open.baseLabel, theirsLabel: found.label,
        oursAt: [open.start + 1, oursEnd], theirsAt: [open.split + 1, index],
      });
      open = null;
    }
  }
  return open ? null : regions;
}

/**
 * The conflict regions in `text` with markers `size` long, or null when they're malformed (unclosed, nested, out of order,
 * or a region with two separators).
 */
export function parseConflictRegions(text: string, size = 7): ConflictRegion[] | null {
  return parse(splitLines(text), size)?.map(({ oursAt: _ours, theirsAt: _theirs, ...region }) => region) ?? null;
}

/**
 * `text` with region `index` replaced by ours' lines, theirs' lines, or ours' then theirs' (the base section is dropped).
 * Every other byte, including the other regions and line endings, is kept. Throws when there is no such region.
 */
export function resolveConflictRegion(text: string, index: number, side: ConflictRegionSide, size = 7): string {
  const lines = splitLines(text);
  const region = parse(lines, size)?.[index];
  if (!region) throw new Error("That conflict is no longer in the file.");
  const pick = ([from, to]: [number, number]) => lines.slice(from, to);
  const kept = side === "ours" ? pick(region.oursAt) : side === "theirs" ? pick(region.theirsAt) : [...pick(region.oursAt), ...pick(region.theirsAt)];
  return [...lines.slice(0, region.start), ...kept, ...lines.slice(region.end)].join("");
}
