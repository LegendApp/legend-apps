import {
  createMarkdownDocument,
  loadMarkdownFile,
  type MarkdownFileLoadResult,
  type MarkdownDocument as NativeMarkdownDocument,
  type MarkdownRenderBlock,
  type MarkdownTransactionResult as NativeMarkdownTransactionResult,
} from "@legend-desktop/markdown-parser";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentSnapshot,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "../types";

const initialBlockCount = 64;

let nextDocumentNumber = 1;

type NativeDocumentSession = {
  nativeDocument: NativeMarkdownDocument;
  blocksById: Map<string, MarkdownBlockSnapshot>;
};

const sessions = new Map<string, NativeDocumentSession>();

function nextDocumentId() {
  const documentId = `native:${nextDocumentNumber}`;
  nextDocumentNumber += 1;
  return documentId;
}

function toBlockSnapshot(block: MarkdownRenderBlock): MarkdownBlockSnapshot {
  return {
    id: block.id,
    index: block.index,
    type: block.type,
    depth: block.depth,
    headingLevel: block.headingLevel,
    markdown: block.markdown,
    sourceStartByte: block.sourceStartByte,
    sourceEndByte: block.sourceEndByte,
    contentStartByte: block.contentStartByte,
    contentEndByte: block.contentEndByte,
    textRevision: block.textRevision,
  };
}

function cacheBlocks(session: NativeDocumentSession, blocks: MarkdownBlockSnapshot[]) {
  for (const block of blocks) {
    session.blocksById.set(block.id, block);
  }
}

function getBlockAtIndex(session: NativeDocumentSession, index: number) {
  const block = session.nativeDocument.getRenderBlocks(index, 1)[0];
  if (!block) {
    return undefined;
  }

  const snapshot = toBlockSnapshot(block);
  cacheBlocks(session, [snapshot]);
  return snapshot;
}

function toTransactionResult(result: NativeMarkdownTransactionResult): MarkdownTransactionResult {
  return {
    revision: result.revision,
    sourceLength: result.sourceLength,
    changedRange: {
      startBlockIndex: result.changedRange.startBlockIndex,
      deleteCount: result.changedRange.deleteCount,
      blockIds: result.changedRange.blockIds,
    },
    changedBlocks: result.changedBlocks.map(toBlockSnapshot),
    retiredBlockIds: result.retiredBlockIds,
  };
}

function getSession(documentId: string) {
  const session = sessions.get(documentId);
  if (!session) {
    throw new Error(`Markdown document session is closed: ${documentId}`);
  }
  return session;
}

type NativeMarkdownDocumentAdapter = MarkdownDocumentAdapter & {
  loadDocument(filename: string, result: MarkdownFileLoadResult): Promise<MarkdownDocumentSnapshot>;
  loadMarkdown(filename: string, markdown: string): Promise<MarkdownDocumentSnapshot>;
};

export const nativeMarkdownDocumentAdapter: NativeMarkdownDocumentAdapter = {
  async loadDocument(filename: string, result: MarkdownFileLoadResult): Promise<MarkdownDocumentSnapshot> {
    const documentId = nextDocumentId();
    const timing = result.document.getTiming();
    const initialBlocks = result.initialBlocks.map(toBlockSnapshot);
    const session: NativeDocumentSession = {
      nativeDocument: result.document,
      blocksById: new Map(),
    };

    cacheBlocks(session, initialBlocks);
    sessions.set(documentId, session);

    return {
      documentId,
      filename,
      sourceSize: result.document.sourceSize,
      blockCount: result.document.blockCount,
      initialBlocks,
      timing,
    };
  },

  async load(filename: string): Promise<MarkdownDocumentSnapshot> {
    return nativeMarkdownDocumentAdapter.loadDocument(filename, await loadMarkdownFile(filename, { initialBlockCount }));
  },

  async loadMarkdown(filename: string, markdown: string): Promise<MarkdownDocumentSnapshot> {
    return nativeMarkdownDocumentAdapter.loadDocument(filename, await createMarkdownDocument(markdown, { initialBlockCount }));
  },

  getBlockAtIndexSync(documentId: string, index: number): MarkdownBlockSnapshot | undefined {
    const session = getSession(documentId);
    const blockId = session.nativeDocument.getBlockKey(index);
    const cached = blockId ? session.blocksById.get(blockId) : undefined;
    return cached ?? getBlockAtIndex(session, index);
  },

  async getBlock(documentId: string, blockId: string): Promise<MarkdownBlockSnapshot> {
    const session = getSession(documentId);
    const cached = session.blocksById.get(blockId);
    if (cached) {
      return cached;
    }

    const block = toBlockSnapshot(session.nativeDocument.getRenderBlockById(blockId));
    cacheBlocks(session, [block]);
    return block;
  },

  async getBlockIds(documentId: string, startIndex: number, count: number): Promise<string[]> {
    if (count <= 0) {
      return [];
    }

    const session = getSession(documentId);
    return session.nativeDocument.getBlockIds(startIndex, count);
  },

  async getBlocks(documentId: string, startIndex: number, count: number): Promise<MarkdownBlockSnapshot[]> {
    if (count <= 0) {
      return [];
    }

    const session = getSession(documentId);
    const blocks = session.nativeDocument.getRenderBlocks(startIndex, count).map(toBlockSnapshot);
    cacheBlocks(session, blocks);
    return blocks;
  },

  async save(documentId: string): Promise<void> {
    getSession(documentId).nativeDocument.save();
  },

  async saveAs(documentId: string, filename: string): Promise<void> {
    getSession(documentId).nativeDocument.saveAs(filename);
  },

  async close(documentId: string): Promise<void> {
    sessions.delete(documentId);
  },

  async applyTransaction(documentId: string, transaction: MarkdownTransaction): Promise<MarkdownTransactionResult> {
    const session = getSession(documentId);
    const nativeTransaction =
      transaction.type === "replaceBlockRange"
        ? {
            type: transaction.type,
            blockId: transaction.startBlockId,
            beforeMarkdown: transaction.endBlockId,
            markdown: transaction.markdown,
          }
        : transaction.type === "moveBlockRange"
        ? {
            type: transaction.type,
            blockId: transaction.startBlockId,
            beforeMarkdown: transaction.endBlockId,
            markdown: transaction.targetBlockId,
            afterMarkdown: transaction.placement,
          }
        : transaction;
    const result = toTransactionResult(session.nativeDocument.applyTransaction(nativeTransaction));
    cacheBlocks(session, result.changedBlocks);
    for (const retiredBlockId of result.retiredBlockIds) {
      session.blocksById.delete(retiredBlockId);
    }
    return result;
  },
};
