import {
  createMarkdownDocument,
  loadMarkdownFile,
  type MarkdownFileLoadResult,
  type MarkdownDocument as NativeMarkdownDocument,
  type MarkdownBlockMetadata as NativeMarkdownBlockMetadata,
  type MarkdownRenderBlock,
  type MarkdownTransactionResult as NativeMarkdownTransactionResult,
} from "@legend-desktop/markdown-parser";
import type {
  MarkdownBlockMetadata,
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

function toBlockMetadata(block: NativeMarkdownBlockMetadata): MarkdownBlockMetadata {
  return {
    id: block.id,
    index: block.index,
    type: block.type,
    depth: block.depth,
    headingLevel: block.headingLevel,
    markdownLength: block.markdownLength,
    sourceStartByte: block.sourceStartByte,
    sourceEndByte: block.sourceEndByte,
    contentStartByte: block.contentStartByte,
    contentEndByte: block.contentEndByte,
    textRevision: block.textRevision,
  };
}

function getBlockAtIndex(session: NativeDocumentSession, index: number) {
  const block = session.nativeDocument.getBlockMetadata(index, 1)[0];
  if (!block) {
    return undefined;
  }

  return toBlockMetadata(block);
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
    const initialBlocks = result.initialBlocks.map(toBlockMetadata);
    const session: NativeDocumentSession = {
      nativeDocument: result.document,
    };

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

  getBlockAtIndexSync(documentId: string, index: number): MarkdownBlockMetadata | undefined {
    const session = getSession(documentId);
    return getBlockAtIndex(session, index);
  },

  async getBlock(documentId: string, blockId: string): Promise<MarkdownBlockSnapshot> {
    const session = getSession(documentId);
    return toBlockSnapshot(session.nativeDocument.getRenderBlockById(blockId));
  },

  async getBlockIds(documentId: string, startIndex: number, count: number): Promise<string[]> {
    if (count <= 0) {
      return [];
    }

    const session = getSession(documentId);
    return session.nativeDocument.getBlockIds(startIndex, count);
  },

  async getBlockMetadata(documentId: string, startIndex: number, count: number): Promise<MarkdownBlockMetadata[]> {
    if (count <= 0) {
      return [];
    }

    const session = getSession(documentId);
    return session.nativeDocument.getBlockMetadata(startIndex, count).map(toBlockMetadata);
  },

  async getBlocks(documentId: string, startIndex: number, count: number): Promise<MarkdownBlockSnapshot[]> {
    if (count <= 0) {
      return [];
    }

    const session = getSession(documentId);
    return session.nativeDocument.getRenderBlocks(startIndex, count).map(toBlockSnapshot);
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
    return result;
  },
};
