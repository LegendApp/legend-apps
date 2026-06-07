import type { MarkdownBlockSnapshot, MarkdownTransactionResult } from "./types";

export type MarkdownDocumentBlockState = {
  blockIds: string[];
  blocksById: Map<string, MarkdownBlockSnapshot>;
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
  const blocksById = new Map<string, MarkdownBlockSnapshot>();
  const blockIds: string[] = [];
  for (const block of blocks) {
    if (!blocksById.has(block.id)) {
      blockIds.push(block.id);
    }
    blocksById.set(block.id, block);
  }
  return { blockIds, blocksById };
}

export function mergeHydratedMarkdownBlocks(
  previousState: MarkdownDocumentBlockState,
  blocks: MarkdownBlockSnapshot[],
): MarkdownDocumentBlockState {
  const seen = new Set(previousState.blockIds);
  const blockIds = [...previousState.blockIds];
  const blocksById = new Map(previousState.blocksById);

  for (const block of blocks) {
    blocksById.set(block.id, block);
    if (!seen.has(block.id)) {
      seen.add(block.id);
      blockIds.push(block.id);
    }
  }

  return { blockIds, blocksById };
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

export function applyMarkdownTransactionResultToBlockState(
  previousState: MarkdownDocumentBlockState,
  result: MarkdownTransactionResult,
): MarkdownDocumentBlockState {
  const blocksById = new Map(previousState.blocksById);
  for (const retiredBlockId of result.retiredBlockIds) {
    blocksById.delete(retiredBlockId);
  }
  for (const block of result.changedBlocks) {
    blocksById.set(block.id, block);
  }

  const blockIds = [...previousState.blockIds];
  blockIds.splice(
    result.changedRange.startBlockIndex,
    result.changedRange.deleteCount,
    ...result.changedRange.blockIds,
  );

  return { blockIds, blocksById };
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

    if (!state.blocksById.has(blockId)) {
      throw new Error(`Markdown block id is missing a block snapshot: ${blockId}`);
    }
    if (retiredBlockIds.has(blockId)) {
      throw new Error(`Retired markdown block id remains in document state: ${blockId}`);
    }
  }

  if (context.activeBlockId && !state.blocksById.has(context.activeBlockId)) {
    throw new Error(`Active markdown block id is not live: ${context.activeBlockId}`);
  }

  if (context.blockSelection) {
    if (!state.blocksById.has(context.blockSelection.anchorBlockId)) {
      throw new Error(`Block selection anchor id is not live: ${context.blockSelection.anchorBlockId}`);
    }
    if (!state.blocksById.has(context.blockSelection.focusBlockId)) {
      throw new Error(`Block selection focus id is not live: ${context.blockSelection.focusBlockId}`);
    }
  }
}
