import { getPasteCaret } from "../pasteCaret";
import type { MarkdownBlockSnapshot } from "../types";

function blocks(markdown: string[], start = 0): MarkdownBlockSnapshot[] {
  return markdown.map((text, index) => {
    const block = { id: `${index}`, index, markdown: text, sourceStartByte: start, sourceEndByte: start + Buffer.byteLength(text) } as MarkdownBlockSnapshot;
    start = block.sourceEndByte + 2;
    return block;
  });
}

describe("paste caret", () => {
  it("selects the inserted paragraph before a retained suffix", () => {
    const result = blocks(["Alpha", "Pasted suffix"]);
    expect(getPasteCaret(result, 0, "Alpha\n\nPasted")).toEqual({ block: result[1], markdownPrefix: "Pasted" });
  });
  it("converts UTF-8 ranges without splitting emoji or losing hidden syntax", () => {
    const result = blocks(["中文", "**👩🏽‍💻 café**suffix"], 37);
    expect(getPasteCaret(result, 37, "中文\n\n**👩🏽‍💻 café**")).toEqual({ block: result[1], markdownPrefix: "**👩🏽‍💻 café**" });
  });
  it("clamps an insertion ending in a block separator to the preceding block", () => {
    const result = blocks(["Alpha", "Tail"]);
    expect(getPasteCaret(result, 0, "Alpha\n")).toEqual({ block: result[0], markdownPrefix: "Alpha" });
    expect(getPasteCaret(result, 0, "Alpha\n\n")).toEqual({ block: result[1], markdownPrefix: "" });
  });
});
