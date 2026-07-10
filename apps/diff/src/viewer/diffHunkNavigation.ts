export function getAdjacentDiffHunkIndex(
  hunkIndexes: readonly number[],
  currentIndex: number,
  direction: -1 | 1,
) {
  let targetIndex: number | null = null;

  if (direction > 0) {
    targetIndex = hunkIndexes.find((index) => index > currentIndex) ?? null;
  } else {
    for (let index = hunkIndexes.length - 1; index >= 0; index -= 1) {
      const candidate = hunkIndexes[index];
      if (candidate !== undefined && candidate < currentIndex) {
        targetIndex = candidate;
        break;
      }
    }
  }

  return targetIndex;
}
