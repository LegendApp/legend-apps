import {
  editableTextStyleForBlock,
  estimateMarkdownSelectionVerticalRange,
} from "../markdownLayout";
import { defaultMarkdownStyle } from "../styles";
import type { MarkdownBlockSnapshot } from "../types";

describe("estimateMarkdownSelectionVerticalRange", () => {
  it("estimates the selected line inside a padded code block", () => {
    const markdown = "```\nalpha\nbeta\ngamma\n```";
    const range = estimateMarkdownSelectionVerticalRange(
      markdown,
      "```\nalpha\nbeta".length,
      700,
      { fontSize: 13, lineHeight: 21.45, padding: 20 },
    );

    expect(range.top).toBeCloseTo(20 + 2 * 21.45);
    expect(range.bottom).toBeCloseTo(20 + 3 * 21.45);
  });

  it("accounts for wrapped visual lines before the selection", () => {
    const markdown = "1234567890abcdefghij\nselected";
    const range = estimateMarkdownSelectionVerticalRange(
      markdown,
      markdown.indexOf("selected"),
      100,
      { fontSize: 10, lineHeight: 20 },
    );

    expect(range.top).toBe(40);
    expect(range.bottom).toBe(60);
  });
});

describe("editableTextStyleForBlock", () => {
  it("keeps code editor text metrics without rendered code block decoration", () => {
    const block: MarkdownBlockSnapshot = {
      contentEndByte: 16,
      contentStartByte: 0,
      depth: 0,
      headingLevel: 0,
      id: "d1:b0",
      index: 0,
      markdown: "```\ncode\n```",
      sourceEndByte: 16,
      sourceStartByte: 0,
      textRevision: 0,
      type: "codeBlock",
    };
    const style = Object.assign({}, ...editableTextStyleForBlock(block, defaultMarkdownStyle));
    const codeBlockStyle = defaultMarkdownStyle.codeBlock!;

    expect(style).toEqual(expect.objectContaining({
      color: codeBlockStyle.color,
      fontFamily: codeBlockStyle.fontFamily,
      fontSize: codeBlockStyle.fontSize,
      lineHeight: codeBlockStyle.lineHeight,
    }));
    expect(style.backgroundColor).toBe("transparent");
    expect(style.backgroundColor).not.toBe(codeBlockStyle.backgroundColor);
    expect(style.borderColor).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
    expect(style.padding).toBe(0);
    expect(style.paddingTop).toBeUndefined();
    expect(style.paddingRight).toBeUndefined();
    expect(style.paddingBottom).toBeUndefined();
    expect(style.paddingLeft).toBeUndefined();
  });
});
