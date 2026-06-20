import {
  editableTextStyleForBlock,
  estimateMarkdownSelection,
} from "../markdownLayout";
import { defaultMarkdownStyle } from "../styles";
import type { MarkdownBlockSnapshot } from "../types";

function pressEvent(locationX: number, locationY = 0) {
  return { nativeEvent: { locationX, locationY } } as never;
}

describe("estimateMarkdownSelection", () => {
  it("maps rendered heading text clicks after the hidden markdown prefix", () => {
    expect(estimateMarkdownSelection("### Heading", pressEvent(0), 700)).toBe("### ".length);
    expect(estimateMarkdownSelection("### Heading", pressEvent(16), 700)).toBe("### He".length);
  });

  it("keeps paragraph selection offsets unchanged", () => {
    expect(estimateMarkdownSelection("Paragraph", pressEvent(16), 700)).toBe("Pa".length);
  });

  it("uses rendered heading text length for wrapped selection", () => {
    const markdown = "### 1234567890abcdefghijk";

    expect(estimateMarkdownSelection(markdown, pressEvent(0, 25), 80)).toBe("### 1234567890abcdefghij".length);
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
