export function getAdjacentDiffHunkIndex(
  hunkIndexes: readonly number[],
  currentPosition: number,
  direction: -1 | 1,
  getPositionAtIndex: (index: number) => number = (index) => index,
) {
  let targetIndex: number | null = null;

  if (direction > 0) {
    targetIndex = hunkIndexes.find((index) => getPositionAtIndex(index) > currentPosition) ?? null;
  } else {
    for (let index = hunkIndexes.length - 1; index >= 0; index -= 1) {
      const candidate = hunkIndexes[index];
      if (candidate !== undefined && getPositionAtIndex(candidate) < currentPosition) {
        targetIndex = candidate;
        break;
      }
    }
  }

  return targetIndex;
}
