import {
  blockRowSpacingStyle,
  editableMarkdownForBlock,
  editableSelectionForBlock,
  editableTextStyleForBlock,
  estimateMarkdownSelection,
  inputStyleFromMarkdownStyle,
  markdownFromEditableMarkdownForBlock,
  markdownSelectionFromEditableSelectionForBlock,
} from "../markdownLayout";
import { defaultMarkdownLayout, defaultMarkdownStyle } from "../styles";
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

  it("maps vertical padding clicks to the nearest block edge", () => {
    expect(estimateMarkdownSelection("Paragraph", pressEvent(0, 4), 700, { paddingTop: 12, paddingBottom: 8 })).toBe(0);
    expect(estimateMarkdownSelection("Paragraph", pressEvent(0, 46), 700, { paddingTop: 12, paddingBottom: 8 })).toBe(
      "Paragraph".length,
    );
  });
});

describe("heading editable markdown mapping", () => {
  const headingBlock: MarkdownBlockSnapshot = {
    contentEndByte: 11,
    contentStartByte: 0,
    depth: 0,
    headingLevel: 3,
    id: "d1:b0",
    index: 0,
    markdown: "### Heading",
    sourceEndByte: 11,
    sourceStartByte: 0,
    textRevision: 0,
    type: "heading",
  };

  it("removes heading syntax from the editable value", () => {
    expect(editableMarkdownForBlock(headingBlock, "### Heading")).toBe("Heading");
  });

  it("restores heading syntax when publishing edited markdown", () => {
    expect(markdownFromEditableMarkdownForBlock(headingBlock, "Renamed", "### Heading")).toBe("### Renamed");
  });

  it("maps heading selections between canonical and editable offsets", () => {
    expect(editableSelectionForBlock(headingBlock, "### He".length, "### Heading")).toBe("He".length);
    expect(markdownSelectionFromEditableSelectionForBlock(headingBlock, "He".length, "### Heading")).toBe("### He".length);
  });
});

describe("blockRowSpacingStyle", () => {
  const paragraphBlock: MarkdownBlockSnapshot = {
    contentEndByte: 9,
    contentStartByte: 0,
    depth: 0,
    headingLevel: 0,
    id: "d1:b0",
    index: 0,
    markdown: "Paragraph",
    sourceEndByte: 9,
    sourceStartByte: 0,
    textRevision: 0,
    type: "paragraph",
  };
  const headingBlock: MarkdownBlockSnapshot = {
    ...paragraphBlock,
    headingLevel: 2,
    id: "d1:b1",
    index: 1,
    markdown: "## Heading",
    type: "heading",
  };

  it("moves collapsed inter-block spacing inside the following row hit target", () => {
    expect(blockRowSpacingStyle(headingBlock, paragraphBlock, true, true, defaultMarkdownLayout)).toEqual(
      expect.objectContaining({
        paddingBottom: 0,
        paddingTop: Math.max(
          defaultMarkdownLayout.blockSpacing.paragraph.marginBottom ?? 0,
          defaultMarkdownLayout.blockSpacing.heading[2].marginTop ?? 0,
        ),
      }),
    );
  });

  it("keeps final bottom spacing inside the last row hit target", () => {
    expect(blockRowSpacingStyle(paragraphBlock, undefined, false, false, defaultMarkdownLayout)).toEqual(
      expect.objectContaining({
        paddingBottom: defaultMarkdownLayout.blockSpacing.paragraph.marginBottom,
        paddingTop: 0,
      }),
    );
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

describe("inputStyleFromMarkdownStyle", () => {
  it("derives spoiler input colors from the active markdown theme", () => {
    const markdownStyle = {
      ...defaultMarkdownStyle,
      code: {
        ...defaultMarkdownStyle.code,
        backgroundColor: "#2d2e30",
      },
      paragraph: {
        ...defaultMarkdownStyle.paragraph,
        color: "#f5f5f5",
      },
    };

    expect(inputStyleFromMarkdownStyle(markdownStyle).spoiler).toEqual({
      backgroundColor: "#2d2e30",
      color: "#f5f5f5",
    });
  });

  it("preserves explicit spoiler input colors", () => {
    const markdownStyle = {
      ...defaultMarkdownStyle,
      spoiler: {
        backgroundColor: "#123456",
        color: "#abcdef",
      },
    } as typeof defaultMarkdownStyle;

    expect(inputStyleFromMarkdownStyle(markdownStyle).spoiler).toEqual({
      backgroundColor: "#123456",
      color: "#abcdef",
    });
  });
});
