import { findBlockIdAtContentY, getBlockSelectionRects } from "../blockSelection";
import type { BlockLayout } from "../internalTypes";

const layoutsByBlockId = new Map<string, BlockLayout>([
  ["a", { y: 0, height: 40 }],
  ["b", { y: 60, height: 40 }],
  ["c", { y: 120, height: 40 }],
]);
const getBlockLayout = (blockId: string) => layoutsByBlockId.get(blockId);

describe("blockSelection", () => {
  it("hit-tests content coordinates", () => {
    const blockIds = ["a", "b", "c"];

    expect(findBlockIdAtContentY({
      blockIds,
      getBlockLayout,
      y: 72,
    })).toBe("b");

    expect(findBlockIdAtContentY({
      blockIds,
      getBlockLayout,
      y: 132,
    })).toBe("c");
  });

  it("does not switch downward selection to the next block while the pointer is still in the gap above it", () => {
    expect(findBlockIdAtContentY({
      blockIds: ["a", "b", "c"],
      direction: "down",
      getBlockLayout,
      y: 50,
    })).toBe("a");
  });

  it("does not switch upward selection to the previous block while the pointer is still in the gap below it", () => {
    expect(findBlockIdAtContentY({
      blockIds: ["a", "b", "c"],
      direction: "up",
      getBlockLayout,
      y: 110,
    })).toBe("c");
  });

  it("returns block selection rects in document content coordinates", () => {
    expect(getBlockSelectionRects({
      blockIds: ["a", "b", "c"],
      blockSelection: { anchorBlockId: "b", focusBlockId: "c" },
      getBlockLayout,
    })).toEqual([
      { blockId: "b", height: 40, y: 60 },
      { blockId: "c", height: 40, y: 120 },
    ]);
  });
});
