import { replaceSelectedText, selectedTextFragments, type MarkdownTextSelection } from "../textSelection";
import type { MarkdownBlockSnapshot } from "../types";

const block = (id: string, markdown: string, type = "paragraph") => ({ id, markdown, type } as MarkdownBlockSnapshot);
const blocks = [block("a", "Hello **world**"), block("b", "middle"), block("c", "*Good* bye")];
const selection: MarkdownTextSelection = {
  anchor: { blockId: "a", index: 0, offset: 8, beforeMarkdown: "Hello **wo**", afterMarkdown: "**rld**" },
  focus: { blockId: "c", index: 2, offset: 2, beforeMarkdown: "*Go*", afterMarkdown: "*od* bye" },
  sameBlockMarkdown: "",
};

describe("document text selection", () => {
  it("copies partial endpoints and complete middle blocks without slicing hidden syntax", () => {
    expect(selectedTextFragments(selection, blocks)?.markdown).toBe("**rld**\n\nmiddle\n\n*Go*");
    expect(replaceSelectedText(selection, blocks, "X")?.replacement).toBe("Hello **wo**X*od* bye");
    expect(replaceSelectedText(selection, blocks, "X")?.caret).toBe(9);
  });
  it("normalizes a backwards selection", () => {
    const reverse = { ...selection, anchor: selection.focus, focus: selection.anchor };
    expect(replaceSelectedText(reverse, blocks, "")).toEqual(replaceSelectedText(selection, blocks, ""));
  });
  it("coalesces matching rich-text boundaries instead of producing ambiguous Markdown", () => {
    const sameFormat = { ...selection,
      anchor: { ...selection.anchor, beforeMarkdown: "Hello **wo**" },
      focus: { ...selection.focus, afterMarkdown: "**rld** bye" },
    };
    expect(replaceSelectedText(sameFormat, blocks, "")?.replacement).toBe("Hello **world** bye");
    expect(replaceSelectedText(sameFormat, blocks, "X")?.replacement).toBe("Hello **wo**X**rld** bye");
  });
  it("uses native serialization inside one block and preserves Unicode offsets", () => {
    const one = { anchor: { blockId: "a", index: 0, offset: 2, beforeMarkdown: "👩", afterMarkdown: "**hello**" },
      focus: { blockId: "a", index: 0, offset: 4, beforeMarkdown: "👩**he**", afterMarkdown: "**llo**" }, sameBlockMarkdown: "**he**" };
    expect(selectedTextFragments(one, blocks)?.markdown).toBe("**he**");
    expect(replaceSelectedText(one, blocks, "")?.replacement).toBe("👩**llo**");
  });
  it("preserves structural boundaries and rejects stale deleted endpoints", () => {
    const structural = [block("a", "# Hello", "heading"), blocks[2]!];
    expect(replaceSelectedText(selection, structural, "")?.replacement).toBe("Hello **wo**\n\n*od* bye");
    expect(replaceSelectedText(selection, [blocks[0]!], "")).toBeUndefined();
  });
});
