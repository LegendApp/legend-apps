import type {
  DataSourceMutationBatch,
  DataSourceOperation,
  LegendListDataSource,
} from "@legendapp/list/react-native";
import type {
  MarkdownBlockMetadata,
  MarkdownDocumentAdapter,
  MarkdownDocumentSnapshot,
  MarkdownTransactionResult,
} from "./types";

type MutationListener = (batch: DataSourceMutationBatch) => void;

export class MarkdownBlockDataSource implements LegendListDataSource<string> {
  private readonly indexedAdapter: boolean;
  private readonly listeners = new Set<MutationListener>();
  private readonly blockIndexById = new Map<string, number>();
  private blockIds: string[];
  private length: number;
  private revision = 0;

  constructor(
    private readonly adapter: MarkdownDocumentAdapter,
    private readonly documentId: string,
    snapshot: MarkdownDocumentSnapshot,
    blockIds = snapshot.initialBlocks.map((block) => block.id),
  ) {
    this.indexedAdapter = !!adapter.getBlockIdAtIndexSync && !!adapter.getBlockIndexForIdSync;
    this.blockIds = this.indexedAdapter ? [] : blockIds;
    this.length = this.indexedAdapter ? snapshot.blockCount : blockIds.length;
    this.rebuildFallbackIndex();
  }

  getLength() {
    return this.length;
  }

  getItem(index: number) {
    if (index < 0 || index >= this.length) {
      return undefined;
    }
    return this.indexedAdapter
      ? this.adapter.getBlockIdAtIndexSync?.(this.documentId, index)
      : this.blockIds[index];
  }

  getKey(index: number) {
    const blockId = this.getItem(index);
    if (!blockId) {
      throw new Error(`Missing markdown block id at index ${index}.`);
    }
    return blockId;
  }

  getIndexForBlockId(blockId: string) {
    return this.indexedAdapter
      ? this.adapter.getBlockIndexForIdSync?.(this.documentId, blockId) ?? -1
      : this.blockIndexById.get(blockId) ?? -1;
  }

  getRevision() {
    return this.revision;
  }

  subscribe(listener: MutationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  appendHydratedBlocks(blocks: MarkdownBlockMetadata[]) {
    if (!this.indexedAdapter && blocks.length > 0) {
      const previousLength = this.length;
      for (const block of blocks) {
        if (!this.blockIndexById.has(block.id)) {
          this.blockIndexById.set(block.id, this.blockIds.length);
          this.blockIds.push(block.id);
        }
      }
      this.length = this.blockIds.length;
      const insertCount = this.length - previousLength;
      if (insertCount > 0) {
        this.publish(previousLength, [{
          type: "splice",
          index: previousLength,
          deleteCount: 0,
          insertCount,
        }]);
      }
    }
  }

  validateTransactionResult(result: MarkdownTransactionResult) {
    const { blockIds, deleteCount, startBlockIndex } = result.changedRange;
    if (startBlockIndex < 0 || deleteCount < 0 || startBlockIndex + deleteCount > this.length) {
      throw new Error("Markdown transaction changed range is out of bounds.");
    }
    if (blockIds.length !== result.changedBlocks.length) {
      throw new Error("Markdown transaction changed block ids do not match changed blocks.");
    }

    const changedBlocksById = new Map<string, MarkdownBlockMetadata>();
    for (const block of result.changedBlocks) {
      if (!block.id) {
        throw new Error("Markdown transaction returned a changed block with an empty id.");
      }
      if (!block.type) {
        throw new Error(`Markdown transaction returned a changed block with an empty type: ${block.id}`);
      }
      if (changedBlocksById.has(block.id)) {
        throw new Error(`Markdown transaction returned duplicate changed block id: ${block.id}`);
      }
      changedBlocksById.set(block.id, block);
    }

    const changedBlockIds = new Set<string>();
    const retiredBlockIds = new Set(result.retiredBlockIds);
    const replacedRangeEnd = startBlockIndex + deleteCount;
    for (const [offset, blockId] of blockIds.entries()) {
      const block = result.changedBlocks[offset];
      if (!blockId) {
        throw new Error("Markdown transaction changed range contains an empty block id.");
      }
      if (changedBlockIds.has(blockId)) {
        throw new Error(`Markdown transaction changed range contains duplicate block id: ${blockId}`);
      }
      if (!changedBlocksById.has(blockId)) {
        throw new Error(`Markdown transaction changed range block is missing a snapshot: ${blockId}`);
      }
      if (retiredBlockIds.has(blockId)) {
        throw new Error(`Markdown transaction reuses a retired block id: ${blockId}`);
      }
      const existingIndex = this.indexedAdapter ? -1 : this.blockIndexById.get(blockId) ?? -1;
      if (existingIndex >= 0 && (existingIndex < startBlockIndex || existingIndex >= replacedRangeEnd)) {
        throw new Error(`Markdown transaction duplicates a live block id: ${blockId}`);
      }
      if (!block || block.id !== blockId) {
        throw new Error(`Markdown transaction changed block order does not match changed range: ${blockId}`);
      }
      if (block.index !== startBlockIndex + offset) {
        throw new Error(`Markdown transaction changed block index is inconsistent: ${blockId}`);
      }
      if (block.sourceStartByte > block.sourceEndByte || block.sourceEndByte > result.sourceLength) {
        throw new Error(`Markdown transaction changed block source range is invalid: ${blockId}`);
      }
      if (
        block.contentStartByte !== undefined &&
        block.contentEndByte !== undefined &&
        (block.contentStartByte > block.contentEndByte || block.contentEndByte > result.sourceLength)
      ) {
        throw new Error(`Markdown transaction changed block content range is invalid: ${blockId}`);
      }
      changedBlockIds.add(blockId);
    }

    if (!this.indexedAdapter) {
      for (const retiredBlockId of retiredBlockIds) {
        const existingIndex = this.blockIndexById.get(retiredBlockId) ?? -1;
        if (existingIndex >= 0 && (existingIndex < startBlockIndex || existingIndex >= replacedRangeEnd)) {
          throw new Error(`Retired markdown block id remains live: ${retiredBlockId}`);
        }
      }
    }
  }

  applyTransactionResult(result: MarkdownTransactionResult, preservedFirstBlockId?: string) {
    this.validateTransactionResult(result);
    const { blockIds, deleteCount, startBlockIndex } = result.changedRange;
    const previousLength = this.length;
    if (
      preservedFirstBlockId !== undefined &&
      (deleteCount === 0 || blockIds[0] !== preservedFirstBlockId || result.retiredBlockIds.includes(preservedFirstBlockId))
    ) {
      throw new Error(`Markdown transaction did not preserve the expected first block id: ${preservedFirstBlockId}`);
    }

    if (!this.indexedAdapter) {
      this.blockIds.splice(startBlockIndex, deleteCount, ...blockIds);
      this.rebuildFallbackIndex();
    }
    this.length = previousLength - deleteCount + blockIds.length;

    const preservesFirstBlock = preservedFirstBlockId !== undefined || (
      deleteCount === 1 &&
      blockIds.length === 1 &&
      result.retiredBlockIds.length === 0
    );
    const operations: DataSourceOperation[] = preservesFirstBlock
      ? [{ type: "update", index: startBlockIndex, count: 1, layout: "invalidate" }]
      : [];
    const remainingDeleteCount = preservesFirstBlock ? deleteCount - 1 : deleteCount;
    const remainingInsertCount = preservesFirstBlock ? blockIds.length - 1 : blockIds.length;
    if (remainingDeleteCount > 0 || remainingInsertCount > 0) {
      operations.push({
        type: "splice",
        index: startBlockIndex + (preservesFirstBlock ? 1 : 0),
        deleteCount: remainingDeleteCount,
        insertCount: remainingInsertCount,
      });
    }
    this.publish(previousLength, operations);
  }

  private publish(previousLength: number, operations: DataSourceOperation[]) {
    const previousRevision = this.revision;
    this.revision += 1;
    const batch: DataSourceMutationBatch = {
      length: this.length,
      operations,
      previousLength,
      previousRevision,
      revision: this.revision,
    };
    this.listeners.forEach((listener) => listener(batch));
  }

  private rebuildFallbackIndex() {
    this.blockIndexById.clear();
    this.blockIds.forEach((blockId, index) => {
      this.blockIndexById.set(blockId, index);
    });
  }
}
