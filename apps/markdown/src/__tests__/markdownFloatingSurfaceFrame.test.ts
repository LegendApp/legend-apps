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
      top: 69,
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
      top: 69,
      width: 36,
    });
  });
});
