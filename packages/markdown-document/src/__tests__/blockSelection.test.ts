import { findBlockIdAtWindowY, getBlockSelectionRects } from "../blockSelection";
import type { BlockLayout } from "../internalTypes";

const layoutsByBlockId = new Map<string, BlockLayout>([
  ["a", { y: 0, height: 40 }],
  ["b", { y: 60, height: 40 }],
  ["c", { y: 120, height: 40 }],
]);

describe("blockSelection", () => {
  it("converts a native window Y to content coordinates before hit-testing", () => {
    const blockIds = ["a", "b", "c"];

    expect(findBlockIdAtWindowY({
      blockIds,
      containerWindowY: 100,
      layoutsByBlockId,
      scrollOffsetY: 0,
      windowY: 172,
    })).toBe("b");

    expect(findBlockIdAtWindowY({
      blockIds,
      containerWindowY: 100,
      layoutsByBlockId,
      scrollOffsetY: 60,
      windowY: 172,
    })).toBe("c");
  });

  it("does not switch downward selection to the next block while the pointer is still in the gap above it", () => {
    expect(findBlockIdAtWindowY({
      blockIds: ["a", "b", "c"],
      containerWindowY: 100,
      direction: "down",
      layoutsByBlockId,
      scrollOffsetY: 0,
      windowY: 150,
    })).toBe("a");
  });

  it("does not switch upward selection to the previous block while the pointer is still in the gap below it", () => {
    expect(findBlockIdAtWindowY({
      blockIds: ["a", "b", "c"],
      containerWindowY: 100,
      direction: "up",
      layoutsByBlockId,
      scrollOffsetY: 0,
      windowY: 210,
    })).toBe("c");
  });

  it("returns block selection rects in document content coordinates", () => {
    expect(getBlockSelectionRects({
      blockIds: ["a", "b", "c"],
      blockSelection: { anchorBlockId: "b", focusBlockId: "c" },
      layoutsByBlockId,
    })).toEqual([
      { blockId: "b", height: 40, y: 60 },
      { blockId: "c", height: 40, y: 120 },
    ]);
  });
});
