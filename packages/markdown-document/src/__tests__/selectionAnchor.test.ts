import { resolveTextSelectionAnchor } from "../selectionAnchor";

describe("resolveTextSelectionAnchor", () => {
  it("uses the native caret rect for text selection anchors", () => {
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 44, x: 6, y: 25 },
      contentItemX: 32,
      itemHeight: 50,
      itemWidth: 700,
      itemY: 100,
      paragraphLineHeight: 25,
      scrollOffsetY: 12,
      selectedLength: 6,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      kind: "textSelection",
      width: 44,
      x: 38,
      y: 137,
    }));
  });

  it("keeps native caret coordinates even at line starts", () => {
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 1, x: 0, y: 25 },
      contentItemX: 32,
      itemHeight: 50,
      itemWidth: 180,
      itemY: 100,
      paragraphLineHeight: 25,
      scrollOffsetY: 12,
      selectedLength: 6,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      kind: "textSelection",
      width: 1,
      x: 32,
      y: 137,
    }));
  });

  it("keeps native overlay selection anchors in visible coordinates when no scroll offset is applied", () => {
    const anchor = resolveTextSelectionAnchor({
      caretRect: { height: 18, width: 88, x: 220, y: 0 },
      contentItemX: 40,
      itemHeight: 36,
      itemWidth: 640,
      itemY: 680,
      paragraphLineHeight: 25,
      scrollOffsetY: 0,
      selectedLength: 20,
    });

    expect(anchor).toEqual(expect.objectContaining({
      height: 25,
      itemHeight: 36,
      itemWidth: 640,
      itemY: 680,
      kind: "textSelection",
      y: 680,
    }));
  });
});
