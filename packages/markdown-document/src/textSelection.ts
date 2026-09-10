import type { MarkdownBlockSnapshot } from "./types";

/** UTF-16 positions in rendered text, with independently serialized fragments.
 * Never use these offsets to slice Markdown source: hidden syntax has a different length. */
export type MarkdownTextEndpoint = {
  blockId: string;
  index: number;
  offset: number;
  beforeMarkdown: string;
  afterMarkdown: string;
};

export type MarkdownTextSelection = {
  anchor: MarkdownTextEndpoint;
  focus: MarkdownTextEndpoint;
  /** Native serialization for a selection contained in one block. */
  sameBlockMarkdown: string;
};

function joinInlineFragments(left: string, right: string) {
  // Independently serialized rich fragments close/reopen their formatting.
  // Four adjacent stars, for example, are NOT equivalent to one bold span in
  // CommonMark. Coalesce identical, unescaped boundary delimiters.
  for (const delimiter of ["***", "___", "**", "__", "~~", "==", "*", "_", "~", "^", "`"]) {
    if (!left.endsWith(delimiter) || !right.startsWith(delimiter)) continue;
    const before = left.slice(0, -delimiter.length);
    const after = right.slice(delimiter.length);
    if (before.endsWith(delimiter[0]!) || after.startsWith(delimiter[0]!)) continue;
    const escapes = before.match(/\\+$/)?.[0].length ?? 0;
    if (escapes % 2 === 1 || !before.includes(delimiter) || !after.includes(delimiter)) continue;
    return before + after;
  }
  return left + right;
}

export function selectedTextFragments(selection: MarkdownTextSelection, blocks: readonly MarkdownBlockSnapshot[]) {
  const anchorIndex = blocks.findIndex((block) => block.id === selection.anchor.blockId);
  const focusIndex = blocks.findIndex((block) => block.id === selection.focus.blockId);
  if (anchorIndex < 0 || focusIndex < 0) return undefined;
  const forward = anchorIndex < focusIndex || (anchorIndex === focusIndex && selection.anchor.offset <= selection.focus.offset);
  const start = forward ? selection.anchor : selection.focus;
  const end = forward ? selection.focus : selection.anchor;
  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  const markdown = startIndex === endIndex ? selection.sameBlockMarkdown : [
    start.afterMarkdown,
    ...blocks.slice(startIndex + 1, endIndex).map((block) => block.markdown),
    end.beforeMarkdown,
  ].join("\n\n");
  return { start, end, startIndex, endIndex, markdown };
}

export function replaceSelectedText(selection: MarkdownTextSelection, blocks: readonly MarkdownBlockSnapshot[], insertion: string) {
  const selected = selectedTextFragments(selection, blocks);
  if (!selected) return undefined;
  const first = blocks[selected.startIndex]!;
  const last = blocks[selected.endIndex]!;
  const before = selected.start.beforeMarkdown;
  const after = selected.end.afterMarkdown;
  // Paragraphs form one text flow. Distinct structural blocks retain their
  // boundary, rather than splicing a heading/list/fence into a paragraph.
  const joinsText = selected.startIndex === selected.endIndex || (first.type === "paragraph" && last.type === "paragraph");
  const markdown = joinsText
    ? first.type === "paragraph" && last.type === "paragraph"
      ? joinInlineFragments(joinInlineFragments(before, insertion), after)
      : before + insertion + after
    : [before, insertion, after].filter(Boolean).join("\n\n");
  return { ...selected, replacement: markdown, caret: selected.start.offset + insertion.length };
}
