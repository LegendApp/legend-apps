import { getMarkdownFloatingSurfaceFrame } from "../markdownFloatingSurfaceFrame";

describe("getMarkdownFloatingSurfaceFrame", () => {
  it("uses the content item width for text selection toolbars", () => {
    const frame = getMarkdownFloatingSurfaceFrame({
      anchor: {
        height: 25,
        itemHeight: 40,
        itemWidth: 640,
        itemX: 32,
        itemY: 100,
        kind: "textSelection",
        selectedLength: 4,
        width: 36,
        x: 148,
        y: 125,
      },
      coordinateSpace: "content",
    });

    expect(frame).toEqual({
      left: 32,
      top: 79,
      width: 640,
    });
  });

  it("falls back to selection bounds when content item bounds are unavailable", () => {
    const frame = getMarkdownFloatingSurfaceFrame({
      anchor: {
        height: 25,
        kind: "textSelection",
        width: 36,
        x: 148,
        y: 125,
      },
      coordinateSpace: "content",
    });

    expect(frame).toEqual({
      left: 148,
      top: 79,
      width: 36,
    });
  });

  it("keeps item-coordinate toolbars close to the selected text", () => {
    const frame = getMarkdownFloatingSurfaceFrame({
      anchor: {
        height: 25,
        itemHeight: 40,
        itemWidth: 640,
        itemX: 32,
        itemY: 100,
        kind: "textSelection",
        selectedLength: 4,
        width: 36,
        x: 148,
        y: 125,
      },
    });

    expect(frame).toEqual({
      left: 0,
      top: -21,
      width: 640,
    });
  });

  it("positions content-coordinate toolbars against the visible selection y", () => {
    const frame = getMarkdownFloatingSurfaceFrame({
      anchor: {
        height: 25,
        itemHeight: 36,
        itemWidth: 640,
        itemX: 40,
        itemY: 680,
        kind: "textSelection",
        selectedLength: 20,
        width: 88,
        x: 260,
        y: 680,
      },
      coordinateSpace: "content",
    });

    expect(frame).toEqual({
      left: 40,
      top: 634,
      width: 640,
    });
  });
});
