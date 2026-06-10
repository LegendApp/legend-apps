import { resolveTextSelectionAnchor } from "../selectionAnchor";

describe("resolveTextSelectionAnchor", () => {
  it("ignores a stale right-edge caret rect when selection starts after a newline", () => {
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 1, x: 680, y: 0 },
      contentItemX: 32,
      itemHeight: 50,
      itemWidth: 700,
      itemY: 100,
      markdown: "First line\nSecond line",
      paragraphFontSize: 16,
      paragraphLineHeight: 25,
      scrollOffsetY: 12,
      selectedLength: 6,
      selectionEnd: "First line\nSecond".length,
      selectionStart: "First line\n".length,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      itemX: 32,
      itemY: 112,
      kind: "textSelection",
      width: 54,
      x: 32,
      y: 137,
    }));
  });

  it("uses the native selection rect for soft-wrapped line starts", () => {
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 44, x: 6, y: 25 },
      contentItemX: 32,
      itemHeight: 50,
      itemWidth: 700,
      itemY: 100,
      markdown: "A long line whose visual wrap starts before selected",
      paragraphFontSize: 16,
      paragraphLineHeight: 25,
      scrollOffsetY: 12,
      selectedLength: 6,
      selectionEnd: 44,
      selectionStart: 38,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      kind: "textSelection",
      width: 44,
      x: 38,
      y: 137,
    }));
  });

  it("corrects a stale right-edge caret rect at the start of a soft-wrapped line", () => {
    const markdown = "12345678901234567890Second line";
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 1, x: 174, y: 0 },
      contentItemX: 32,
      itemHeight: 50,
      itemWidth: 180,
      itemY: 100,
      markdown,
      paragraphFontSize: 16,
      paragraphLineHeight: 25,
      scrollOffsetY: 12,
      selectedLength: 6,
      selectionEnd: 26,
      selectionStart: 20,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      kind: "textSelection",
      width: 54,
      x: 32,
      y: 137,
    }));
  });
});
