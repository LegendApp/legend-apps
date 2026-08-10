import type { BlockLayout, BlockSelectionState } from "./internalTypes";

export type GetBlockLayout = (blockId: string, index: number) => BlockLayout | undefined;

export function findBlockIdAtContentY({
  direction,
  endIndex,
  getBlockCount,
  getBlockIdAtIndex,
  getBlockLayout,
  startIndex = 0,
  y,
}: {
  direction?: "down" | "up";
  endIndex?: number;
  getBlockCount: () => number;
  getBlockIdAtIndex: (index: number) => string | undefined;
  getBlockLayout: GetBlockLayout;
  startIndex?: number;
  y: number;
}) {
  const layouts: { blockId: string; layout: BlockLayout }[] = [];
  const finalIndex = Math.min(endIndex ?? getBlockCount() - 1, getBlockCount() - 1);
  for (let index = Math.max(0, startIndex); index <= finalIndex; index += 1) {
    const blockId = getBlockIdAtIndex(index);
    if (blockId) {
      const layout = getBlockLayout(blockId, index);
      if (layout) {
        layouts.push({ blockId, layout });
      }
    }
  }
  layouts.sort((a, b) => a.layout.y - b.layout.y);

  for (let index = 0; index < layouts.length; index += 1) {
    const entry = layouts[index];
    if (!entry) {
      continue;
    }

    const previousEntry = layouts[index - 1];
    const nextEntry = layouts[index + 1];
    const blockTop = entry.layout.y;
    const blockBottom = entry.layout.y + entry.layout.height;
    const previousBottom = previousEntry ? previousEntry.layout.y + previousEntry.layout.height : Number.NEGATIVE_INFINITY;
    const nextTop = nextEntry ? nextEntry.layout.y : Number.POSITIVE_INFINITY;
    const hitTop = direction === "up"
      ? previousBottom
      : previousEntry
        ? (previousBottom + blockTop) / 2
        : Number.NEGATIVE_INFINITY;
    const hitBottom = direction === "down"
      ? nextTop
      : nextEntry
        ? (blockBottom + nextTop) / 2
        : Number.POSITIVE_INFINITY;

    if (y >= hitTop && y < hitBottom) {
      return entry.blockId;
    }
  }

  return undefined;
}

export function getBlockSelectionRects({
  blockSelection,
  getBlockIdAtIndex,
  getBlockIndexById,
  getBlockLayout,
}: {
  blockSelection: BlockSelectionState | null;
  getBlockIdAtIndex: (index: number) => string | undefined;
  getBlockIndexById: (blockId: string) => number;
  getBlockLayout: GetBlockLayout;
}) {
  const rects: { blockId: string; height: number; y: number }[] = [];
  if (!blockSelection) {
    return rects;
  }

  const anchorIndex = getBlockIndexById(blockSelection.anchorBlockId);
  const focusIndex = getBlockIndexById(blockSelection.focusBlockId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return rects;
  }

  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  for (let index = startIndex; index <= endIndex; index += 1) {
    const blockId = getBlockIdAtIndex(index);
    const layout = blockId ? getBlockLayout(blockId, index) : undefined;
    if (blockId && layout) {
      rects.push({
        blockId,
        height: layout.height,
        y: layout.y,
      });
    }
  }
  return rects;
}
