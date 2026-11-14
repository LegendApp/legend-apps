import type { DiffSideBySideProjection, DiffSideBySideProjectionItem } from "@legend-apps/diff-parser";
import { validateStory, type ChangeStory, type StoryRef } from "./storyContract";
import type { StoryHunk, StoryInput } from "./storyHunks";

export type StoryRow = { key: string } & (
  | { type: "section"; section: ChangeStory["sections"][number] }
  | { type: "hunk"; hunk: StoryHunk; ref: StoryRef; contextKey: string; expanded: boolean; partial: boolean }
  | { type: "line"; sourceIndex: number; item?: DiffSideBySideProjectionItem; listIndex?: number }
  | { type: "list"; title: string; items: string[] }
  | { type: "uncovered"; full: boolean }
  | { type: "file"; path: string; note?: string }
);

export function buildStoryRows(story: ChangeStory, input: StoryInput, options: {
  expanded?: ReadonlySet<string>; projection?: DiffSideBySideProjection;
} = {}) {
  const rows: StoryRow[] = [];
  const sections: number[] = [];
  const byId = new Map(input.hunks.map(hunk => [hunk.id, hunk]));
  const validation = validateStory(story, input.hunks);
  function appendRef(ref: StoryRef, key: string) {
    const hunk = byId.get(ref.hunk)!;
    const partial = ref.side !== undefined;
    const expanded = options.expanded?.has(key) ?? false;
    rows.push({ type: "hunk", key, hunk, ref, contextKey: key, expanded, partial });
    const selected = partial && !expanded ? hunk.rows.filter(row => {
      const line = ref.side === "old" ? row.oldLineNumber : row.newLineNumber;
      return line >= ref.startLine! && line <= ref.endLine!;
    }) : hunk.rows;
    if (options.projection) {
      const projection = options.projection;
      const indexes = new Set(selected.map(row => projection.getSourceLocation(row.index).listIndex));
      for (const listIndex of [...indexes].sort((a, b) => a - b)) {
        const itemId = projection.getItemId(listIndex);
        const item = projection.getItem(itemId);
        rows.push({ type: "line", key: `${key}:${itemId}`, sourceIndex: itemId, listIndex, item: { ...item, hunkStart: false } });
      }
    } else for (const row of selected) rows.push({ type: "line", key: `${key}:${row.index}`, sourceIndex: row.index });
  }
  for (const section of validation.story.sections) {
    sections.push(rows.length);
    rows.push({ type: "section", key: `section:${section.id}`, section });
    section.refs.forEach((ref, index) => appendRef(ref, `${section.id}:${index}`));
  }
  const lists = [
    { title: "Behavior changes", items: story.behaviorChanges.map(item => `${item.change}\nBefore: ${item.before}\nNow: ${item.now}\nWhen: ${item.when}\nWhy: ${item.why}`) },
    { title: "Evidence", items: story.evidence.map(item => `${item.ran ? "Ran" : "Not run"}: ${item.text}`) },
    { title: "Not verified", items: story.notVerified },
    { title: "Decisions", items: story.decisions },
  ];
  for (const list of lists) if (list.items.length) rows.push({ type: "list", key: list.title, ...list });
  const withoutHunks = input.files.filter(file => !file.hunks.length);
  rows.push({ type: "uncovered", key: "uncovered", full: validation.uncovered.length === 0 && withoutHunks.length === 0 });
  for (const group of validation.uncovered) {
    rows.push({ type: "file", key: `uncovered:${group.file}`, path: group.file });
    group.hunkIds.forEach(hunk => appendRef({ hunk }, `uncovered:${hunk}`));
  }
  for (const { file } of withoutHunks) rows.push({ type: "file", key: `metadata:${file.index}`, path: file.path,
    note: file.isBinary ? "Binary file — no text hunks" : "Metadata-only change — no text hunks" });
  return { rows, sections, coverage: { covered: validation.coveredHunkIds.length, total: input.hunks.length } };
}

export function nextStorySection(sectionIndexes: readonly number[], current: number, direction: -1 | 1) {
  return sectionIndexes.length ? Math.max(0, Math.min(sectionIndexes.length - 1, current + direction)) : -1;
}
