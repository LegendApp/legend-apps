import { getAdjacentDiffHunkIndex } from "../diffHunkNavigation";

describe("getAdjacentDiffHunkIndex", () => {
  const hunkIndexes = [2, 8, 14];

  it("finds the next hunk after the visible row", () => {
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 2, 1)).toBe(8);
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 9, 1)).toBe(14);
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 14, 1)).toBeNull();
  });

  it("finds the previous hunk before the visible row", () => {
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 14, -1)).toBe(8);
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 7, -1)).toBe(2);
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 2, -1)).toBeNull();
  });

  it("advances past a hunk positioned below the titlebar", () => {
    const positions = new Map([
      [2, 40],
      [8, 180],
      [14, 340],
    ]);
    const getPositionAtIndex = (index: number) => positions.get(index) ?? 0;

    expect(getAdjacentDiffHunkIndex(hunkIndexes, 180, 1, getPositionAtIndex)).toBe(14);
    expect(getAdjacentDiffHunkIndex(hunkIndexes, 180, -1, getPositionAtIndex)).toBe(2);
  });
});
