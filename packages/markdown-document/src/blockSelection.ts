import type { BlockLayout, BlockSelectionState } from "./internalTypes";
import type { MarkdownBlockSnapshot } from "./types";

export function findBlockIdAtWindowY({
  blockIds,
  containerWindowY,
  direction,
  layoutsByBlockId,
  scrollOffsetY,
  windowY,
}: {
  blockIds: string[];
  containerWindowY: number;
  direction?: "down" | "up";
  layoutsByBlockId: Map<string, BlockLayout>;
  scrollOffsetY: number;
  windowY: number;
}) {
  const y = windowY - containerWindowY + scrollOffsetY;
  const layouts = blockIds
    .map((blockId) => {
      const layout = layoutsByBlockId.get(blockId);
      return layout ? { blockId, layout } : undefined;
    })
    .filter((entry): entry is { blockId: string; layout: BlockLayout } => entry !== undefined)
    .sort((a, b) => a.layout.y - b.layout.y);

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
  blockIds,
  blockSelection,
  layoutsByBlockId,
}: {
  blockIds: string[];
  blockSelection: BlockSelectionState | null;
  layoutsByBlockId: Map<string, BlockLayout>;
}) {
  const rects: { blockId: string; height: number; y: number }[] = [];
  if (!blockSelection) {
    return rects;
  }

  const anchorIndex = blockIds.indexOf(blockSelection.anchorBlockId);
  const focusIndex = blockIds.indexOf(blockSelection.focusBlockId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return rects;
  }

  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  for (let index = startIndex; index <= endIndex; index += 1) {
    const blockId = blockIds[index];
    const layout = blockId ? layoutsByBlockId.get(blockId) : undefined;
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

export function getSelectedBlockMarkdown({
  blockIds,
  blocksById,
  blockSelection,
}: {
  blockIds: string[];
  blocksById: Map<string, MarkdownBlockSnapshot>;
  blockSelection: BlockSelectionState;
}) {
  const anchorIndex = blockIds.indexOf(blockSelection.anchorBlockId);
  const focusIndex = blockIds.indexOf(blockSelection.focusBlockId);
  if (anchorIndex < 0 || focusIndex < 0) {
    return null;
  }

  const startIndex = Math.min(anchorIndex, focusIndex);
  const endIndex = Math.max(anchorIndex, focusIndex);
  const startBlockId = blockIds[startIndex];
  const endBlockId = blockIds[endIndex];
  if (!startBlockId || !endBlockId) {
    return null;
  }

  const selectedMarkdown: string[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const block = blocksById.get(blockIds[index] ?? "");
    if (!block) {
      return null;
    }
    selectedMarkdown.push(block.markdown);
  }

  return {
    endBlockId,
    endIndex,
    markdown: selectedMarkdown.join("\n\n"),
    startBlockId,
    startIndex,
  };
}
