import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "@legend-desktop/markdown-document";
import { writeTextFile } from "@legend-desktop/file-dialog";

const untitledDocumentId = "untitled:document";
const untitledFilename = "Untitled.md";

type UntitledState = {
  blocks: MarkdownBlockSnapshot[];
  revision: number;
};

function blockTypeForMarkdown(markdown: string) {
  if (/^ {0,3}#{1,6}\s/.test(markdown)) {
    return "heading";
  }
  if (/^ {0,3}```/.test(markdown)) {
    return "codeBlock";
  }
  return "paragraph";
}

function headingLevelForMarkdown(markdown: string) {
  return markdown.match(/^ {0,3}(#{1,6})\s/)?.[1]?.length ?? 0;
}

function createBlock(id: string, index: number, markdown: string, revision: number): MarkdownBlockSnapshot {
  const type = blockTypeForMarkdown(markdown);

  return {
    id,
    index,
    type,
    depth: 0,
    headingLevel: type === "heading" ? headingLevelForMarkdown(markdown) : 0,
    markdown,
    sourceStartByte: 0,
    sourceEndByte: markdown.length,
    contentStartByte: 0,
    contentEndByte: markdown.length,
    textRevision: revision,
  };
}

function sourceLength(blocks: MarkdownBlockSnapshot[]) {
  return blocks.reduce((total, block, index) => total + block.markdown.length + (index > 0 ? 1 : 0), 0);
}

function sourceMarkdown() {
  return state.blocks.map((block) => block.markdown).join("\n");
}

function normalizeBlocks(blocks: MarkdownBlockSnapshot[]) {
  let offset = 0;
  return blocks.map((block, index) => {
    const start = offset;
    const end = start + block.markdown.length;
    offset = end + 1;
    return {
      ...block,
      index,
      sourceStartByte: start,
      sourceEndByte: end,
      contentStartByte: start,
      contentEndByte: end,
    };
  });
}

function createBlocksFromMarkdown(markdown: string, startIndex: number, revision: number) {
  return markdown.split(/\r?\n/).map((blockMarkdown, offset) => {
    const block = createBlock(`untitled:block:${nextBlockId}`, startIndex + offset, blockMarkdown, revision);
    nextBlockId += 1;
    return block;
  });
}

function createState(): UntitledState {
  return {
    blocks: [createBlock("untitled:block:1", 0, "", 0)],
    revision: 0,
  };
}

let state = createState();
let nextBlockId = 2;

function resultForChange(
  changedBlocks: MarkdownBlockSnapshot[],
  startBlockIndex: number,
  deleteCount: number,
  retiredBlockIds: string[] = [],
): MarkdownTransactionResult {
  return {
    revision: state.revision,
    sourceLength: sourceLength(state.blocks),
    changedRange: {
      startBlockIndex,
      deleteCount,
      blockIds: changedBlocks.map((block) => block.id),
    },
    changedBlocks,
    retiredBlockIds,
  };
}

function applyUpdateBlockMarkdown(transaction: Extract<MarkdownTransaction, { type: "updateBlockMarkdown" }>) {
  const index = state.blocks.findIndex((block) => block.id === transaction.blockId);
  if (index < 0) {
    throw new Error(`Untitled markdown block not found: ${transaction.blockId}`);
  }

  state.revision += 1;
  const updatedBlock = createBlock(transaction.blockId, index, transaction.markdown, state.revision);
  state.blocks = normalizeBlocks([
    ...state.blocks.slice(0, index),
    updatedBlock,
    ...state.blocks.slice(index + 1),
  ]);
  return resultForChange([state.blocks[index]], index, 1);
}

function applySplitBlock(transaction: Extract<MarkdownTransaction, { type: "splitBlock" }>) {
  const index = state.blocks.findIndex((block) => block.id === transaction.blockId);
  if (index < 0) {
    throw new Error(`Untitled markdown block not found: ${transaction.blockId}`);
  }

  state.revision += 1;
  const firstBlock = createBlock(transaction.blockId, index, transaction.beforeMarkdown, state.revision);
  const secondBlock = createBlock(`untitled:block:${nextBlockId}`, index + 1, transaction.afterMarkdown, state.revision);
  nextBlockId += 1;
  state.blocks = normalizeBlocks([
    ...state.blocks.slice(0, index),
    firstBlock,
    secondBlock,
    ...state.blocks.slice(index + 1),
  ]);
  return resultForChange([state.blocks[index], state.blocks[index + 1]], index, 1);
}

function applyReplaceBlockRange(transaction: Extract<MarkdownTransaction, { type: "replaceBlockRange" }>) {
  const startIndex = state.blocks.findIndex((block) => block.id === transaction.startBlockId);
  const endIndex = state.blocks.findIndex((block) => block.id === transaction.endBlockId);
  if (startIndex < 0) {
    throw new Error(`Untitled markdown block not found: ${transaction.startBlockId}`);
  }
  if (endIndex < 0) {
    throw new Error(`Untitled markdown block not found: ${transaction.endBlockId}`);
  }

  const rangeStart = Math.min(startIndex, endIndex);
  const rangeEnd = Math.max(startIndex, endIndex);
  const deleteCount = rangeEnd - rangeStart + 1;
  const retiredBlockIds = state.blocks.slice(rangeStart, rangeEnd + 1).map((block) => block.id);
  const replacementBlocks =
    transaction.markdown === undefined
      ? []
      : createBlocksFromMarkdown(transaction.markdown, rangeStart, state.revision + 1);

  state.revision += 1;
  state.blocks = normalizeBlocks([
    ...state.blocks.slice(0, rangeStart),
    ...replacementBlocks,
    ...state.blocks.slice(rangeEnd + 1),
  ]);
  let insertedCount = replacementBlocks.length;
  if (state.blocks.length === 0) {
    state.blocks = normalizeBlocks([createBlock(`untitled:block:${nextBlockId}`, 0, "", state.revision)]);
    nextBlockId += 1;
    insertedCount = 1;
  }
  return resultForChange(state.blocks.slice(rangeStart, rangeStart + insertedCount), rangeStart, deleteCount, retiredBlockIds);
}

export const untitledMarkdownAdapter: MarkdownDocumentAdapter = {
  async load() {
    state = createState();
    nextBlockId = 2;
    return {
      documentId: untitledDocumentId,
      filename: untitledFilename,
      sourceSize: 0,
      blockCount: state.blocks.length,
      initialBlocks: state.blocks,
      timing: {
        readMs: 0,
        parseMs: 0,
        documentMs: 0,
      },
    };
  },
  async getBlock(_documentId, blockId) {
    const block = state.blocks.find((item) => item.id === blockId);
    if (!block) {
      throw new Error(`Untitled markdown block not found: ${blockId}`);
    }
    return block;
  },
  async getBlocks(_documentId, startIndex, count) {
    return count > 0 ? state.blocks.slice(startIndex, startIndex + count) : [];
  },
  async save() {
    // Untitled documents are in-memory until a save-as flow exists.
  },
  async saveAs(_documentId, filename) {
    await writeTextFile(filename, sourceMarkdown());
  },
  async close() {
    state = createState();
    nextBlockId = 2;
  },
  async applyTransaction(_documentId, transaction) {
    if (transaction.type === "updateBlockMarkdown") {
      return applyUpdateBlockMarkdown(transaction);
    }
    if (transaction.type === "splitBlock") {
      return applySplitBlock(transaction);
    }
    if (transaction.type === "replaceBlockRange") {
      return applyReplaceBlockRange(transaction);
    }
    throw new Error(`Unsupported untitled markdown transaction: ${(transaction as MarkdownTransaction).type}`);
  },
};

export { untitledFilename };
