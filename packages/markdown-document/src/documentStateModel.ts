import type { MarkdownBlockSnapshot, MarkdownTransactionResult } from "./types";

export type MarkdownDocumentBlockState = {
  blockIds: string[];
};

export type MarkdownDocumentBlockStateInvariantContext = {
  activeBlockId?: string | null;
  blockSelection?: {
    anchorBlockId: string;
    focusBlockId: string;
  } | null;
  retiredBlockIds?: Iterable<string>;
};

export function createMarkdownDocumentBlockState(blocks: MarkdownBlockSnapshot[]): MarkdownDocumentBlockState {
  const seen = new Set<string>();
  const blockIds: string[] = [];
  for (const block of blocks) {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      blockIds.push(block.id);
    }
  }
  return { blockIds };
}

export function createMarkdownDocumentBlockStateFromIds(
  blockIds: string[],
): MarkdownDocumentBlockState {
  return { blockIds };
}

export function mergeHydratedMarkdownBlockIds(
  previousState: MarkdownDocumentBlockState,
  blockIds: string[],
): MarkdownDocumentBlockState {
  const seen = new Set(previousState.blockIds);
  const nextBlockIds = [...previousState.blockIds];

  for (const blockId of blockIds) {
    if (!seen.has(blockId)) {
      seen.add(blockId);
      nextBlockIds.push(blockId);
    }
  }

  return { blockIds: nextBlockIds };
}

export function mergeHydratedMarkdownBlocks(
  previousState: MarkdownDocumentBlockState,
  blocks: MarkdownBlockSnapshot[],
): MarkdownDocumentBlockState {
  const seen = new Set(previousState.blockIds);
  const blockIds = [...previousState.blockIds];

  for (const block of blocks) {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      blockIds.push(block.id);
    }
  }

  return { blockIds };
}

export function mergeHydratedMarkdownBlocksForRevision({
  blocks,
  currentRevision,
  previousState,
  requestRevision,
}: {
  blocks: MarkdownBlockSnapshot[];
  currentRevision: number;
  previousState: MarkdownDocumentBlockState;
  requestRevision: number;
}): MarkdownDocumentBlockState {
  if (requestRevision !== currentRevision) {
    return previousState;
  }
  return mergeHydratedMarkdownBlocks(previousState, blocks);
}

export function mergeHydratedMarkdownBlockIdsForRevision({
  blockIds,
  currentRevision,
  previousState,
  requestRevision,
}: {
  blockIds: string[];
  currentRevision: number;
  previousState: MarkdownDocumentBlockState;
  requestRevision: number;
}): MarkdownDocumentBlockState {
  if (requestRevision !== currentRevision) {
    return previousState;
  }
  return mergeHydratedMarkdownBlockIds(previousState, blockIds);
}

export function applyMarkdownTransactionResultToBlockState(
  previousState: MarkdownDocumentBlockState,
  result: MarkdownTransactionResult,
): MarkdownDocumentBlockState {
  const blockIds = [...previousState.blockIds];
  blockIds.splice(
    result.changedRange.startBlockIndex,
    result.changedRange.deleteCount,
    ...result.changedRange.blockIds,
  );

  return { blockIds };
}

export function validateMarkdownTransactionResultToBlockState(
  previousState: MarkdownDocumentBlockState,
  result: MarkdownTransactionResult,
): MarkdownDocumentBlockState {
  const { blockIds, deleteCount, startBlockIndex } = result.changedRange;
  if (startBlockIndex < 0 || deleteCount < 0 || startBlockIndex + deleteCount > previousState.blockIds.length) {
    throw new Error("Markdown transaction changed range is out of bounds.");
  }

  if (blockIds.length !== result.changedBlocks.length) {
    throw new Error("Markdown transaction changed block ids do not match changed blocks.");
  }

  const changedBlocksById = new Map<string, MarkdownBlockSnapshot>();
  for (const block of result.changedBlocks) {
    if (block.id.length === 0) {
      throw new Error("Markdown transaction returned a changed block with an empty id.");
    }
    if (block.type.length === 0) {
      throw new Error(`Markdown transaction returned a changed block with an empty type: ${block.id}`);
    }
    if (changedBlocksById.has(block.id)) {
      throw new Error(`Markdown transaction returned duplicate changed block id: ${block.id}`);
    }
    changedBlocksById.set(block.id, block);
  }

  const seenChangedRangeBlockIds = new Set<string>();
  const retiredBlockIds = new Set(result.retiredBlockIds);
  for (const [offset, blockId] of blockIds.entries()) {
    if (blockId.length === 0) {
      throw new Error("Markdown transaction changed range contains an empty block id.");
    }
    if (seenChangedRangeBlockIds.has(blockId)) {
      throw new Error(`Markdown transaction changed range contains duplicate block id: ${blockId}`);
    }
    if (!changedBlocksById.has(blockId)) {
      throw new Error(`Markdown transaction changed range block is missing a snapshot: ${blockId}`);
    }
    if (retiredBlockIds.has(blockId)) {
      throw new Error(`Markdown transaction reuses a retired block id: ${blockId}`);
    }
    const block = result.changedBlocks[offset];
    if (block?.id !== blockId) {
      throw new Error(`Markdown transaction changed block order does not match changed range: ${blockId}`);
    }
    if (block.index !== startBlockIndex + offset) {
      throw new Error(`Markdown transaction changed block index is inconsistent: ${block.id}`);
    }
    if (block.sourceStartByte > block.sourceEndByte || block.sourceEndByte > result.sourceLength) {
      throw new Error(`Markdown transaction changed block source range is invalid: ${block.id}`);
    }
    if (
      block.contentStartByte !== undefined &&
      block.contentEndByte !== undefined &&
      (block.contentStartByte > block.contentEndByte || block.contentEndByte > result.sourceLength)
    ) {
      throw new Error(`Markdown transaction changed block content range is invalid: ${block.id}`);
    }
    seenChangedRangeBlockIds.add(blockId);
  }

  const nextState = applyMarkdownTransactionResultToBlockState(previousState, result);
  assertMarkdownDocumentBlockStateInvariants(nextState, { retiredBlockIds });
  return nextState;
}

export function assertMarkdownDocumentBlockStateInvariants(
  state: MarkdownDocumentBlockState,
  context: MarkdownDocumentBlockStateInvariantContext = {},
) {
  const seen = new Set<string>();
  const retiredBlockIds = new Set(context.retiredBlockIds ?? []);

  for (const blockId of state.blockIds) {
    if (seen.has(blockId)) {
      throw new Error(`Duplicate markdown block id in document state: ${blockId}`);
    }
    seen.add(blockId);

    if (retiredBlockIds.has(blockId)) {
      throw new Error(`Retired markdown block id remains in document state: ${blockId}`);
    }
  }

  if (context.activeBlockId && !seen.has(context.activeBlockId)) {
    throw new Error(`Active markdown block id is not live: ${context.activeBlockId}`);
  }

  if (context.blockSelection) {
    if (!seen.has(context.blockSelection.anchorBlockId)) {
      throw new Error(`Block selection anchor id is not live: ${context.blockSelection.anchorBlockId}`);
    }
    if (!seen.has(context.blockSelection.focusBlockId)) {
      throw new Error(`Block selection focus id is not live: ${context.blockSelection.focusBlockId}`);
    }
  }
}
