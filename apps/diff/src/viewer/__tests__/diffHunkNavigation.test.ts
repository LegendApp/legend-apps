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
});
