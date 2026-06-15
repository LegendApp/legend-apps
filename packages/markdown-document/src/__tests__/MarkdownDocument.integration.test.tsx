import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View } from "react-native";
import { MarkdownDocument } from "../MarkdownDocument";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentCommands,
  MarkdownDocumentProps,
  MarkdownDocumentSnapshot,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "../types";

function block(id: string, index: number, markdown = `Block ${index}`): MarkdownBlockSnapshot {
  return {
    contentEndByte: markdown.length,
    contentStartByte: 0,
    depth: 0,
    headingLevel: 0,
    id,
    index,
    markdown,
    sourceEndByte: markdown.length,
    sourceStartByte: 0,
    textRevision: 0,
    type: "paragraph",
  };
}

function codeBlock(id: string, index: number, markdown = "```\ncode\n```"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    contentEndByte: markdown.length - 3,
    contentStartByte: 4,
    type: "codeBlock",
  };
}

function orderedListBlock(id: string, index: number, markdown = "1. First\n2. Second"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    type: "orderedList",
  };
}

function unorderedListBlock(id: string, index: number, markdown = "- First\n- Second"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    type: "unorderedList",
  };
}

function taskListBlock(id: string, index: number, markdown = "- [ ] First\n- [x] Second"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    type: "unorderedList",
  };
}

function quoteBlock(id: string, index: number, markdown = "> First\n> Second"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    type: "quote",
  };
}

function thematicBreakBlock(id: string, index: number, markdown = "---"): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    type: "thematicBreak",
  };
}

function splitMarkdownLines(markdown: string) {
  return markdown.split(/\r\n|\r|\n/);
}

function markdownDepth(markdown: string) {
  const firstLine = splitMarkdownLines(markdown)[0] ?? "";
  const match = /^(\s*)/.exec(firstLine);
  return Math.floor((match?.[1].replace(/\t/g, "    ").length ?? 0) / 2);
}

function markdownBlockType(markdown: string) {
  const lines = splitMarkdownLines(markdown);
  const firstLine = lines[0] ?? "";
  let type = "paragraph";
  if (/^#{1,6}\s/.test(firstLine)) {
    type = "heading";
  } else if (/^\s*(```|~~~)/.test(firstLine)) {
    type = "codeBlock";
  } else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(firstLine)) {
    type = "thematicBreak";
  } else if (/^\s*\d+\.\s/.test(firstLine)) {
    type = "orderedList";
  } else if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(firstLine)) {
    type = "unorderedList";
  } else if (/^\s*[-*+]\s/.test(firstLine)) {
    type = "unorderedList";
  } else if (/^\s*>/.test(firstLine)) {
    type = "quote";
  } else if (lines.length > 1 && /\|/.test(firstLine) && /^\s*\|?[\s:-]+\|/.test(lines[1] ?? "")) {
    type = "table";
  }
  return type;
}

function markdownBlock(id: string, index: number, markdown: string): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    depth: markdownDepth(markdown),
    type: markdownBlockType(markdown),
  };
}

function splitMarkdownBlocks(markdown: string) {
  const blocks: string[] = [];
  const lines = splitMarkdownLines(markdown);
  let currentLines: string[] = [];
  let inCodeBlock = false;
  let fenceMarker = "";

  const pushCurrentBlock = () => {
    while (currentLines.length > 0 && currentLines[currentLines.length - 1] === "") {
      currentLines.pop();
    }
    if (currentLines.length > 0) {
      blocks.push(currentLines.join("\n"));
      currentLines = [];
    }
  };

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    const startsCodeBlock = currentLines.length === 0 && !!fenceMatch;
    if (startsCodeBlock) {
      inCodeBlock = true;
      fenceMarker = fenceMatch[1];
      currentLines.push(line);
    } else if (inCodeBlock) {
      currentLines.push(line);
      if (fenceMarker.length > 0 && line.trimStart().startsWith(fenceMarker) && currentLines.length > 1) {
        inCodeBlock = false;
        fenceMarker = "";
        pushCurrentBlock();
      }
    } else if (line.trim().length === 0) {
      pushCurrentBlock();
    } else {
      currentLines.push(line);
    }
  }

  pushCurrentBlock();
  return blocks;
}

function snapshot(initialBlocks: MarkdownBlockSnapshot[], blockCount = initialBlocks.length): MarkdownDocumentSnapshot {
  return {
    blockCount,
    documentId: "test-document",
    filename: "test.md",
    initialBlocks,
    sourceSize: 100,
    timing: {
      documentMs: 0,
      parseMs: 0,
      readMs: 0,
    },
  };
}

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function transactionResult({
  blockIds,
  changedBlocks,
  deleteCount,
  retiredBlockIds = [],
  revision,
  sourceLength = 100,
  startBlockIndex,
}: {
  blockIds: string[];
  changedBlocks: MarkdownBlockSnapshot[];
  deleteCount: number;
  retiredBlockIds?: string[];
  revision: number;
  sourceLength?: number;
  startBlockIndex: number;
}): MarkdownTransactionResult {
  return {
    changedBlocks,
    changedRange: {
      blockIds,
      deleteCount,
      startBlockIndex,
    },
    retiredBlockIds,
    revision,
    sourceLength,
  };
}

function flushPromises() {
  return act(async () => {
    await Promise.resolve();
  });
}

function transactionBlockId(transaction: MarkdownTransaction) {
  return transaction.type === "replaceBlockRange" || transaction.type === "moveBlockRange"
    ? transaction.startBlockId
    : transaction.blockId;
}

class MountedEditorAdapter implements MarkdownDocumentAdapter {
  applyTransactions: MarkdownTransaction[] = [];
  closeCount = 0;
  failNextSave: Error | undefined;
  failNextTransaction: Error | undefined;
  mutateNextTransactionResult: ((result: MarkdownTransactionResult) => MarkdownTransactionResult) | undefined;
  pendingTransactionGates: Deferred<void>[] = [];
  pendingHydrationRequests: Array<{
    count: number;
    deferred: Deferred<MarkdownBlockSnapshot[]>;
    startIndex: number;
  }> = [];
  saveCount = 0;
  saveRevisions: number[] = [];
  private blocks: MarkdownBlockSnapshot[] = [];
  private nextBlockNumber = 100;
  private revision = 0;

  constructor(
    private documentSnapshot: MarkdownDocumentSnapshot,
    private allBlocks = documentSnapshot.initialBlocks,
  ) {}

  get blockIds() {
    return this.blocks.map((candidate) => candidate.id);
  }

  get blockTypes() {
    return this.blocks.map((candidate) => candidate.type);
  }

  get blockDepths() {
    return this.blocks.map((candidate) => candidate.depth);
  }

  get markdownById() {
    return new Map(this.blocks.map((candidate) => [candidate.id, candidate.markdown]));
  }

  get sourceMarkdown() {
    return this.blocks.map((candidate) => candidate.markdown).join("\n\n");
  }

  get blockSnapshots() {
    return this.blocks.map((candidate) => ({ ...candidate }));
  }

  async load() {
    this.blocks = this.normalizeBlocks([...this.allBlocks]);
    return this.documentSnapshot;
  }

  async getBlock(_documentId: string, blockId: string) {
    const blockSnapshot = this.blocks.find((candidate) => candidate.id === blockId);
    if (!blockSnapshot) {
      throw new Error(`Missing test block: ${blockId}`);
    }
    return blockSnapshot;
  }

  getBlocks(_documentId: string, startIndex: number, count: number) {
    if (startIndex >= this.blocks.length) {
      return Promise.resolve([]);
    }
    if (startIndex < this.documentSnapshot.initialBlocks.length) {
      return Promise.resolve(this.blocks.slice(startIndex, startIndex + count));
    }

    const deferred = new Deferred<MarkdownBlockSnapshot[]>();
    this.pendingHydrationRequests.push({ count, deferred, startIndex });
    return deferred.promise;
  }

  async save() {
    this.saveCount += 1;
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      throw error;
    }
    this.saveRevisions.push(this.revision);
  }

  async saveAs() {
    this.saveCount += 1;
    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      throw error;
    }
    this.saveRevisions.push(this.revision);
  }

  async close() {
    this.closeCount += 1;
  }

  deferNextTransaction() {
    const deferred = new Deferred<void>();
    this.pendingTransactionGates.push(deferred);
    return deferred;
  }

  async applyTransaction(_documentId: string, transaction: MarkdownTransaction) {
    this.applyTransactions.push(transaction);
    if (this.failNextTransaction) {
      const error = this.failNextTransaction;
      this.failNextTransaction = undefined;
      throw error;
    }
    const transactionGate = this.pendingTransactionGates.shift();
    if (transactionGate) {
      await transactionGate.promise;
    }
    const index = this.blocks.findIndex((candidate) => candidate.id === transactionBlockId(transaction));
    if (index < 0) {
      throw new Error(`Markdown block not found: ${transactionBlockId(transaction)}`);
    }

    let result: MarkdownTransactionResult;
    if (transaction.type === "replaceBlockRange") {
      result = this.applyReplaceBlockRange(index, transaction);
    } else if (transaction.type === "moveBlockRange") {
      result = this.applyMoveBlockRange(index, transaction);
    } else if (transaction.type === "splitBlock") {
      result = this.applySplitBlock(index, transaction.beforeMarkdown, transaction.afterMarkdown);
    } else {
      result = this.applyUpdateBlockMarkdown(index, transaction.markdown);
    }

    if (this.mutateNextTransactionResult) {
      const mutate = this.mutateNextTransactionResult;
      this.mutateNextTransactionResult = undefined;
      return mutate(result);
    }
    return result;
  }

  private nextBlockId() {
    const existingBlockIds = new Set([
      ...this.allBlocks.map((candidate) => candidate.id),
      ...this.blocks.map((candidate) => candidate.id),
    ]);
    let id = `d1:b${this.nextBlockNumber}`;
    while (existingBlockIds.has(id)) {
      this.nextBlockNumber += 1;
      id = `d1:b${this.nextBlockNumber}`;
    }
    this.nextBlockNumber += 1;
    return id;
  }

  private normalizeBlocks(blocks: MarkdownBlockSnapshot[], startIndex = 0) {
    return blocks.map((candidate, index) => ({
      ...candidate,
      contentEndByte: candidate.markdown.length,
      contentStartByte: 0,
      index: startIndex + index,
      sourceEndByte: candidate.markdown.length,
      sourceStartByte: 0,
    }));
  }

  private blocksFromMarkdown(markdown: string, startIndex: number, firstBlockId?: string) {
    if (markdown.length === 0) {
      return [];
    }

    return splitMarkdownBlocks(markdown).map((part, offset) => markdownBlock(
      offset === 0 && firstBlockId ? firstBlockId : this.nextBlockId(),
      startIndex + offset,
      part,
    ));
  }

  private commitChangedRange(
    startIndex: number,
    deleteCount: number,
    changedBlocks: MarkdownBlockSnapshot[],
    retiredBlockIds: string[],
  ) {
    this.revision += 1;
    const normalizedChangedBlocks = this.normalizeBlocks(changedBlocks, startIndex);
    this.blocks.splice(startIndex, deleteCount, ...normalizedChangedBlocks);
    this.blocks = this.normalizeBlocks(this.blocks);
    return transactionResult({
      blockIds: normalizedChangedBlocks.map((candidate) => candidate.id),
      changedBlocks: normalizedChangedBlocks,
      deleteCount,
      retiredBlockIds,
      revision: this.revision,
      sourceLength: this.sourceMarkdown.length,
      startBlockIndex: startIndex,
    });
  }

  private applySplitBlock(index: number, beforeMarkdown: string, afterMarkdown: string) {
    const originalBlock = this.blocks[index]!;
    const changedBlocks = [
      markdownBlock(originalBlock.id, index, beforeMarkdown),
      markdownBlock(this.nextBlockId(), index + 1, afterMarkdown),
    ];
    return this.commitChangedRange(index, 1, changedBlocks, []);
  }

  private applyUpdateBlockMarkdown(index: number, markdown: string) {
    const originalBlock = this.blocks[index]!;
    const changedBlocks = markdown.trim().length === 0
      ? [markdownBlock(originalBlock.id, index, "")]
      : originalBlock.type === "codeBlock"
      ? [{ ...originalBlock, markdown }]
      : this.blocksFromMarkdown(markdown, index, originalBlock.id);
    return this.commitChangedRange(index, 1, changedBlocks, changedBlocks.length > 0 ? [] : [originalBlock.id]);
  }

  private applyReplaceBlockRange(index: number, transaction: Extract<MarkdownTransaction, { type: "replaceBlockRange" }>) {
    const endIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.endBlockId);
    if (endIndex < index) {
      throw new Error(`Markdown block not found: ${transaction.endBlockId}`);
    }

    const deleteCount = endIndex - index + 1;
    const retiredBlockIds = this.blocks.slice(index, index + deleteCount).map((candidate) => candidate.id);
    const changedBlocks = transaction.markdown !== undefined && transaction.markdown.length > 0 && transaction.markdown.trim().length === 0
      ? [markdownBlock(this.nextBlockId(), index, "")]
      : this.blocksFromMarkdown(transaction.markdown ?? "", index);
    return this.commitChangedRange(index, deleteCount, changedBlocks, retiredBlockIds);
  }

  private applyMoveBlockRange(index: number, transaction: Extract<MarkdownTransaction, { type: "moveBlockRange" }>) {
    const endIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.endBlockId);
    const targetIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.targetBlockId);
    if (endIndex < 0 || targetIndex < 0) {
      throw new Error(`Markdown block not found: ${transaction.endBlockId} ${transaction.targetBlockId}`);
    }

    const rangeStartIndex = Math.min(index, endIndex);
    const rangeEndIndex = Math.max(index, endIndex);
    if (targetIndex >= rangeStartIndex && targetIndex <= rangeEndIndex) {
      throw new Error("move target is inside moved range");
    }

    const movedBlocks = this.blocks.slice(rangeStartIndex, rangeEndIndex + 1);
    const remainingBlocks = [
      ...this.blocks.slice(0, rangeStartIndex),
      ...this.blocks.slice(rangeEndIndex + 1),
    ];
    let insertionIndex = targetIndex;
    if (targetIndex > rangeEndIndex) {
      insertionIndex -= movedBlocks.length;
    }
    if (transaction.placement === "after") {
      insertionIndex += 1;
    }
    const reorderedBlocks = [
      ...remainingBlocks.slice(0, insertionIndex),
      ...movedBlocks,
      ...remainingBlocks.slice(insertionIndex),
    ];
    const changedStartIndex = Math.min(rangeStartIndex, targetIndex);
    const changedEndIndex = Math.max(rangeEndIndex, targetIndex);
    const changedBlocks = reorderedBlocks.slice(changedStartIndex, changedEndIndex + 1);
    return this.commitChangedRange(changedStartIndex, changedBlocks.length, changedBlocks, []);
  }
}

async function renderDocument({
  adapter,
  autoFocusFirstBlock = true,
  onCommandStateChange = jest.fn(),
  onDirtyChange = jest.fn(),
  onError = jest.fn(),
  onSaveStateChange = jest.fn(),
  savePolicy = { autosave: false },
  documentProps = {},
}: {
  adapter: MountedEditorAdapter;
  autoFocusFirstBlock?: boolean;
  documentProps?: Partial<MarkdownDocumentProps>;
  onCommandStateChange?: jest.Mock;
  onDirtyChange?: jest.Mock;
  onError?: jest.Mock;
  onSaveStateChange?: jest.Mock;
  savePolicy?: MarkdownDocumentProps["savePolicy"];
}) {
  const commandsRef = React.createRef<MarkdownDocumentCommands>();
  let renderer: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(
      <MarkdownDocument
        adapter={adapter}
        autoFocusFirstBlock={autoFocusFirstBlock}
        commandsRef={commandsRef}
        filename="test.md"
        onCommandStateChange={onCommandStateChange}
        onDirtyChange={onDirtyChange}
        onError={onError}
        onSaveStateChange={onSaveStateChange}
        savePolicy={savePolicy}
        {...documentProps}
      />,
    );
    await Promise.resolve();
  });

  return {
    commandsRef,
    onCommandStateChange,
    onDirtyChange,
    onError,
    onSaveStateChange,
    renderer: renderer!,
  };
}

function editorInputs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByProps({ testID: "markdown-editor-input" });
}

function editorInput(renderer: TestRenderer.ReactTestRenderer, index = 0) {
  const input = editorInputs(renderer)[index];
  if (!input) {
    throw new Error(`Missing markdown editor input ${index}`);
  }
  return input;
}

function expectUniqueBlockIds(adapter: MountedEditorAdapter) {
  expect(new Set(adapter.blockIds).size).toBe(adapter.blockIds.length);
}

function expectActiveBlockExists(renderer: TestRenderer.ReactTestRenderer, adapter: MountedEditorAdapter) {
  const activeMarkdown = editorInput(renderer).props.defaultValue;
  expect([...adapter.markdownById.values()]).toContain(activeMarkdown);
}

function renderedMarkdownNodes(renderer: TestRenderer.ReactTestRenderer, markdown: string) {
  return renderer.root.findAll((node) => node.props.markdown === markdown);
}

function blockSelectionInput(renderer: TestRenderer.ReactTestRenderer) {
  const input = renderer.root.findAll((node) => (
    String(node.type) === "TextInput" &&
    node.props.testID !== "markdown-editor-input"
  ))[0];
  if (!input) {
    throw new Error("Missing block selection input");
  }
  return input;
}

function blockSelectionOverlays(root: TestRenderer.ReactTestRenderer | TestRenderer.ReactTestInstance) {
  const testRoot = "root" in root ? root.root : root;
  return testRoot.findAll((node) => (
    String(node.type) === "View" &&
    typeof node.props.testID === "string" &&
    node.props.testID.startsWith("markdown-block-selection-overlay-")
  ));
}

function expectBlockSelectionOverlays(renderer: TestRenderer.ReactTestRenderer, blockIds: string[]) {
  expect(blockSelectionOverlays(renderer).map((node) => node.props.testID)).toEqual(
    blockIds.map((blockId) => `markdown-block-selection-overlay-${blockId}`),
  );
}

function renderedNodeIndex(renderer: TestRenderer.ReactTestRenderer, predicate: (node: TestRenderer.ReactTestInstance) => boolean) {
  return renderer.root.findAll(() => true).findIndex(predicate);
}

async function changeText(input: TestRenderer.ReactTestInstance, markdown: string) {
  await act(async () => {
    input.props.onChangeText(markdown);
  });
  await flushPromises();
}

async function changeSelection(input: TestRenderer.ReactTestInstance, start: number, end = start) {
  await act(async () => {
    input.props.onChangeSelection({ end, start });
  });
  await flushPromises();
}

async function dragSelectionOutside(renderer: TestRenderer.ReactTestRenderer, markdown: string, direction: string) {
  const renderedNode = renderedMarkdownNodes(renderer, markdown)[0];
  if (!renderedNode) {
    throw new Error(`Missing rendered markdown node: ${markdown}`);
  }

  await act(async () => {
    renderedNode.props.onSelectionDragOutside({ direction });
  });
  await flushPromises();
}

async function pressRenderedMarkdown(renderer: TestRenderer.ReactTestRenderer, markdown: string) {
  const renderedNode = renderedMarkdownNodes(renderer, markdown)[0];
  if (!renderedNode) {
    throw new Error(`Missing rendered markdown node: ${markdown}`);
  }
  const pressable = renderedNode.parent;
  await act(async () => {
    pressable?.props.onPress({
      nativeEvent: {
        locationX: 0,
        locationY: 0,
      },
    });
  });
  await flushPromises();
}

async function runPendingTimers() {
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  await flushPromises();
}

async function undo(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.undo();
  });
  await flushPromises();
}

async function redo(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.redo();
  });
  await flushPromises();
}

async function moveActiveBlockUp(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.moveActiveBlockUp();
  });
  await flushPromises();
}

async function moveActiveBlockDown(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.moveActiveBlockDown();
  });
  await flushPromises();
}

async function focusPreviousBlock(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.focusPreviousBlock();
  });
  await flushPromises();
}

async function focusNextBlock(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.focusNextBlock();
  });
  await flushPromises();
}

async function navigateVerticallyOutside(renderer: TestRenderer.ReactTestRenderer, direction: "up" | "down", preferredX = 320) {
  const input = editorInput(renderer);
  await act(async () => {
    input.props.onVerticalNavigationOutside({ direction, preferredX });
  });
  await flushPromises();
}

async function focusFirstBlock(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.focusFirstBlock();
  });
  await flushPromises();
}

async function focusLastBlock(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  await act(async () => {
    commandsRef.current?.focusLastBlock();
  });
  await flushPromises();
}

async function extendBlockSelectionUp(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  let didHandle = false;
  await act(async () => {
    didHandle = commandsRef.current?.extendBlockSelectionUp() ?? false;
  });
  await flushPromises();
  return didHandle;
}

async function extendBlockSelectionDown(commandsRef: React.RefObject<MarkdownDocumentCommands | null>) {
  let didHandle = false;
  await act(async () => {
    didHandle = commandsRef.current?.extendBlockSelectionDown() ?? false;
  });
  await flushPromises();
  return didHandle;
}

async function expectStableEditingState(renderer: TestRenderer.ReactTestRenderer, adapter: MountedEditorAdapter) {
  await flushPromises();
  expectActiveBlockExists(renderer, adapter);
  expectUniqueBlockIds(adapter);
}

async function expectRepresentableDocument(renderer: TestRenderer.ReactTestRenderer, adapter: MountedEditorAdapter) {
  await expectStableEditingState(renderer, adapter);
  expect(adapter.blockIds.length).toBeGreaterThan(0);
  expect(adapter.blockIds.every((id) => id.length > 0)).toBe(true);
  expect(adapter.blockTypes.every((type) => type.length > 0)).toBe(true);
}

async function replaceActiveMarkdown(
  renderer: TestRenderer.ReactTestRenderer,
  markdown: string,
  previousMarkdown = editorInput(renderer).props.defaultValue,
) {
  await changeSelection(editorInput(renderer), 0, previousMarkdown.length);
  await changeText(editorInput(renderer), markdown);
  await runPendingTimers();
}

describe("MarkdownDocument mounted editing", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const [message] = args;
      if (typeof message === "string" && message.includes("react-test-renderer is deprecated")) {
        return;
      }
      process.stderr.write(`${args.join(" ")}\n`);
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it("debounces plain text edits into one update transaction", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onDirtyChange, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited once");
    await changeText(editorInput(renderer), "Edited twice");
    expect(adapter.applyTransactions).toEqual([]);

    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Edited twice",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Edited twice");
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes a pending edit before save", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Saved edit");
    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Saved edit",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([1]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes a pending structural paste before save", async () => {
    const markdown = [
      "First",
      "",
      "Second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), markdown);
    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([1]);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("autosaves a structural paste after debounce", async () => {
    const markdown = [
      "First",
      "",
      "Second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({
      adapter,
      savePolicy: { autosave: true, debounceMs: 0 },
    });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([1]);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("recovers from a failed structural autosave with an explicit save", async () => {
    const markdown = [
      "First",
      "",
      "Second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    adapter.failNextSave = new Error("autosave failed");
    const onDirtyChange = jest.fn();
    const onError = jest.fn();
    const onSaveStateChange = jest.fn();
    const { commandsRef, renderer } = await renderDocument({
      adapter,
      onDirtyChange,
      onError,
      onSaveStateChange,
      savePolicy: { autosave: true, debounceMs: 0 },
    });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "autosave failed" }));
    expect(onSaveStateChange).toHaveBeenCalledWith("error");
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expectActiveBlockExists(renderer, adapter);

    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();

    expect(adapter.saveCount).toBe(2);
    expect(adapter.saveRevisions).toEqual([1]);
    expect(onSaveStateChange).toHaveBeenCalledWith("idle");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
  });

  it("undoes and redoes a structural paste after autosave", async () => {
    const markdown = [
      "First",
      "",
      "Second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({
      adapter,
      savePolicy: { autosave: true, debounceMs: 0 },
    });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();
    expect(adapter.saveRevisions).toEqual([1]);

    await undo(commandsRef);
    expect(adapter.sourceMarkdown).toBe("Original");
    await expectStableEditingState(renderer, adapter);

    await redo(commandsRef);
    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    await expectStableEditingState(renderer, adapter);

    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();

    expect(adapter.saveRevisions).toEqual([1, 3]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes a pending edit before save as", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Saved as edit");
    await act(async () => {
      await commandsRef.current?.saveAs("renamed.md");
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Saved as edit",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([1]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("flushes a pending edit before activating another block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await pressRenderedMarkdown(renderer, "Second");

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First edited",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    expect(onError).not.toHaveBeenCalled();
  });

  it("splits paragraphs on a newline and keeps the new block active", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Before\nAfter");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "After",
        beforeMarkdown: "Before",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(editorInput(renderer).props.defaultValue).toBe("After");
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues unordered lists when splitting an empty trailing list item", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "- Item")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "- Item\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "- ",
        beforeMarkdown: "- Item",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues ordered lists when splitting an empty trailing list item", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "1. Item")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "1. Item\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "2. ",
        beforeMarkdown: "1. Item",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues ordered lists from their current number when splitting", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "5. Existing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "5. Existing\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "6. ",
        beforeMarkdown: "5. Existing",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("splits an ordered list line into the next item with trailing text", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "5. Existing trailing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "5. Existing".length);
    await changeText(editorInput(renderer), "5. Existing\ntrailing");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "6. trailing",
        beforeMarkdown: "5. Existing",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("splits a task list line into the next unchecked item with trailing text", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "- [x] Done trailing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- [x] Done".length);
    await changeText(editorInput(renderer), "- [x] Done\ntrailing");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "- [ ] trailing",
        beforeMarkdown: "- [x] Done",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues task lists when splitting an empty trailing list item", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "- [x] Done")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "- [x] Done\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "- [ ] ",
        beforeMarkdown: "- [x] Done",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["level 1", "  - Child trailing", "  - Child", "  - trailing"],
    ["level 2", "    - Child trailing", "    - Child", "    - trailing"],
    ["level 3", "      - Child trailing", "      - Child", "      - trailing"],
  ])("splits a nested unordered list item with trailing text at %s", async (_label, originalMarkdown, beforeMarkdown, afterMarkdown) => {
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), beforeMarkdown.length);
    await changeText(editorInput(renderer), `${beforeMarkdown}\ntrailing`);

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown,
        beforeMarkdown,
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["level 1", "  - "],
    ["level 2", "    - "],
    ["level 3", "      - "],
  ])("pressing enter on an empty nested unordered list item exits the list at %s", async (_label, marker) => {
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, marker)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), marker.length);
    await changeText(editorInput(renderer), `${marker}\n`);

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace at the start of a nested list line joins within the list block", async () => {
    const originalMarkdown = [
      "- Parent",
      "  - Child",
      "    - Grandchild",
    ].join("\n");
    const nextMarkdown = [
      "- Parent  - Child",
      "    - Grandchild",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- Parent\n".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates an existing multi-line numbered list without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      orderedListBlock("d1:b0", 0, [
        "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
        "6. Fix race condition in Container layout (Issue #3)",
        "7. Add cleanup for sticky indices changes (Issue #13)",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
      "6. Fix race condition in Container layout (Issue #3) edited",
      "7. Add cleanup for sticky indices changes (Issue #13)",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
          "6. Fix race condition in Container layout (Issue #3) edited",
          "7. Add cleanup for sticky indices changes (Issue #13)",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("appends a line to an existing multi-line numbered list without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      orderedListBlock("d1:b0", 0, [
        "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
        "6. Fix race condition in Container layout (Issue #3)",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
      "6. Fix race condition in Container layout (Issue #3)",
      "7. Add cleanup for sticky indices changes (Issue #13)",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
          "6. Fix race condition in Container layout (Issue #3)",
          "7. Add cleanup for sticky indices changes (Issue #13)",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates an existing multi-line unordered list without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      unorderedListBlock("d1:b0", 0, [
        "- First task",
        "- Second task",
        "- Third task",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "- First task",
      "- Second task edited",
      "- Third task",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "- First task",
          "- Second task edited",
          "- Third task",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates an existing multi-line task list without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      taskListBlock("d1:b0", 0, [
        "- [ ] First task",
        "- [x] Second task",
        "- [ ] Third task",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "- [ ] First task",
      "- [ ] Second task",
      "- [ ] Third task edited",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "- [ ] First task",
          "- [ ] Second task",
          "- [ ] Third task edited",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates an existing multi-line blockquote without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      quoteBlock("d1:b0", 0, [
        "> First line",
        "> Second line",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "> First line",
      "> Second line edited",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "> First line",
          "> Second line edited",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates an existing multi-line paragraph without splitting the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, [
        "First soft-wrapped line",
        "Second soft-wrapped line",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "First soft-wrapped line edited",
      "Second soft-wrapped line",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "First soft-wrapped line edited",
          "Second soft-wrapped line",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates a label plus numbered list block without duplicating the label", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      orderedListBlock("d1:b0", 0, [
        "Medium Priority:",
        "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
        "6. Fix race condition in Container layout (Issue #3)",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "Medium Priority:",
      "5. Optimize zxcvzxcv with reverse lookup map (Issue #6) edited",
      "6. Fix race condition in Container layout (Issue #3)",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "Medium Priority:",
          "5. Optimize zxcvzxcv with reverse lookup map (Issue #6) edited",
          "6. Fix race condition in Container layout (Issue #3)",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.sourceMarkdown.match(/Medium Priority:/g)).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("updates a label plus blank-line numbered list without duplicating the label", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      orderedListBlock("d1:b0", 0, [
        "Medium Priority:",
        "",
        "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
        "6. Fix race condition in Container layout (Issue #3)",
      ].join("\n")),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), [
      "Medium Priority:",
      "",
      "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
      "6. Fix race condition in Container layout (Issue #3) edited",
    ].join("\n"));
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: [
          "Medium Priority:",
          "",
          "5. Optimize zxcvzxcv with reverse lookup map (Issue #6)",
          "6. Fix race condition in Container layout (Issue #3) edited",
        ].join("\n"),
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.sourceMarkdown.match(/Medium Priority:/g)).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not split code blocks on newline edits", async () => {
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, "```\nold\n```")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "```\nold\nnew\n```");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "```\nold\nnew\n```",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter in the middle of a code block adds a line within the code block", async () => {
    const originalMarkdown = "```\nconst before = 1;\nconst after = 2;\n```";
    const nextMarkdown = "```\nconst before = 1;\n\nconst after = 2;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```\nconst before = 1;".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter after the opening code fence adds a line within the code block", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const nextMarkdown = "```\n\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter before the closing code fence adds a line within the code block", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const nextMarkdown = "```\nconst value = 1;\n\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```\nconst value = 1;".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the start of a code block creates a new markdown block before it", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), `\n${originalMarkdown}`);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: originalMarkdown,
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the end of a code block creates a new markdown block after it", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await changeText(editorInput(renderer), `${originalMarkdown}\n`);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: originalMarkdown,
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the end of a multi-line numbered list appends within the list block", async () => {
    const originalMarkdown = [
      "5. First item",
      "6. Second item",
    ].join("\n");
    const nextMarkdown = [
      "5. First item",
      "6. Second item",
      "7. ",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([orderedListBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the end of a multi-line blockquote appends within the blockquote", async () => {
    const originalMarkdown = [
      "> First line",
      "> Second line",
    ].join("\n");
    const nextMarkdown = [
      "> First line",
      "> Second line",
      "> ",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([quoteBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter on an empty unordered list item exits the list", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "- ")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- ".length);
    await changeText(editorInput(renderer), "- \n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter on an empty ordered list item exits the list", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "3. ")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "3. ".length);
    await changeText(editorInput(renderer), "3. \n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace in the middle of a code block updates within the code block", async () => {
    const originalMarkdown = "```\nconst before = 1;\nconst after = 2;\n```";
    const nextMarkdown = "```\nconst before = 1;\nconst after = ;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```\nconst before = 1;\nconst after = 2".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace at the start of the second code line joins within the code block", async () => {
    const originalMarkdown = "```\nconst before = 1;\nconst after = 2;\n```";
    const nextMarkdown = "```\nconst before = 1;const after = 2;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```\nconst before = 1;\n".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace at a code block trailing blank line keeps the edit within the code block", async () => {
    const originalMarkdown = "```\nconst value = 1;\n\n```";
    const nextMarkdown = "```\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```\nconst value = 1;\n\n".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace at the start of the second numbered-list line joins within the list block", async () => {
    const originalMarkdown = [
      "5. First item",
      "6. Second item",
      "7. Third item",
    ].join("\n");
    const nextMarkdown = [
      "5. First item6. Second item",
      "7. Third item",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([orderedListBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "5. First item\n".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace in the middle of a multi-line numbered list updates within the block", async () => {
    const originalMarkdown = [
      "5. First item",
      "6. Second item",
      "7. Third item",
    ].join("\n");
    const nextMarkdown = [
      "5. First item",
      "6. Second",
      "7. Third item",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([orderedListBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "5. First item\n6. Second item".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter in the middle of a heading splits the heading and trailing text", async () => {
    const adapter = new MountedEditorAdapter(snapshot([markdownBlock("d1:b0", 0, "## Heading trailing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "## Heading".length);
    await changeText(editorInput(renderer), "## Heading\ntrailing");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "trailing",
        beforeMarkdown: "## Heading",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the start of a heading creates a paragraph block before it", async () => {
    const adapter = new MountedEditorAdapter(snapshot([markdownBlock("d1:b0", 0, "## Heading")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "\n## Heading");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "## Heading",
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter at the end of a heading creates an empty paragraph block after it", async () => {
    const adapter = new MountedEditorAdapter(snapshot([markdownBlock("d1:b0", 0, "## Heading")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "## Heading".length);
    await changeText(editorInput(renderer), "## Heading\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "## Heading",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("splits a blockquote line into a continued quote with trailing text", async () => {
    const adapter = new MountedEditorAdapter(snapshot([quoteBlock("d1:b0", 0, "> Quote trailing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "> Quote".length);
    await changeText(editorInput(renderer), "> Quote\ntrailing");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "> trailing",
        beforeMarkdown: "> Quote",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["paragraph", block("d1:b0", 0, "Before After"), "Before\r\nAfter", "Before", "After"],
    ["ordered list", orderedListBlock("d1:b0", 0, "1. Item"), "1. Item\r\n", "1. Item", "2. "],
    ["heading", block("d1:b0", 0, "## Heading trailing"), "## Heading\r\ntrailing", "## Heading", "trailing"],
    ["blockquote", quoteBlock("d1:b0", 0, "> Quote trailing"), "> Quote\r\ntrailing", "> Quote", "> trailing"],
  ])("splits %s on CRLF without preserving carriage returns", async (_label, initialBlock, markdown, beforeMarkdown, afterMarkdown) => {
    const adapter = new MountedEditorAdapter(snapshot([initialBlock]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), markdown);

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown,
        beforeMarkdown,
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe(beforeMarkdown);
    expect(adapter.markdownById.get("d1:b100")).toBe(afterMarkdown);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter on an empty blockquote exits the quote", async () => {
    const adapter = new MountedEditorAdapter(snapshot([quoteBlock("d1:b0", 0, "> ")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "> ".length);
    await changeText(editorInput(renderer), "> \n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("preserves a language-tagged code block edit with nested backticks", async () => {
    const originalMarkdown = [
      "```ts",
      "const fence = \"```\";",
      "```",
    ].join("\n");
    const nextMarkdown = [
      "```ts",
      "const fence = \"```\";",
      "const value = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("preserves edits to an empty fenced code block", async () => {
    const originalMarkdown = "```js\n```";
    const nextMarkdown = "```js\n\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "```js\n".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("preserves code block edits adjacent to paragraph and list blocks", async () => {
    const originalMarkdown = "```js\nconst value = 1;\n```";
    const nextMarkdown = "```js\nconst value = 2;\n```";
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "Intro"),
      codeBlock("d1:b1", 1, originalMarkdown),
      unorderedListBlock("d1:b2", 2, "- Item"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, originalMarkdown);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b1",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expect(adapter.blockTypes).toEqual(["paragraph", "codeBlock", "unorderedList"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("typing a thematic break converts the active block to a thematic break", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "---");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "---",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["thematicBreak"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter after a thematic break creates a paragraph block after it", async () => {
    const adapter = new MountedEditorAdapter(snapshot([thematicBreakBlock("d1:b0", 0)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "---".length);
    await changeText(editorInput(renderer), "---\n");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "---",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backspace inside a thematic break updates it as plain markdown", async () => {
    const adapter = new MountedEditorAdapter(snapshot([thematicBreakBlock("d1:b0", 0)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "---".length);
    await changeText(editorInput(renderer), "--");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "--",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("preserves inline markdown syntax and unicode text during edits", async () => {
    const originalMarkdown = "A **bold** [link](https://example.com) `code` \\*escaped\\* café 😊";
    const nextMarkdown = `${originalMarkdown} edited`;
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe(nextMarkdown);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting multi-paragraph markdown into a single-line block creates multiple markdown blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "First paragraph\n\nSecond paragraph");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First paragraph\n\nSecond paragraph",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting multi-line list markdown into an empty block creates one list block", async () => {
    const markdown = [
      "1. First",
      "2. Second",
      "3. Third",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("treats exactly two plain lines in an empty block as a structural split", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "First\nSecond");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "Second",
        beforeMarkdown: "First",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting single paragraph text into an empty block creates one paragraph block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "Just text");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Just text",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["paragraph"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting single heading markdown into an empty block creates one heading block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "## Heading");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "## Heading",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["heading"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting single list item markdown into an empty block creates one list block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "- Item");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "- Item",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["unorderedList"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting single blockquote markdown into an empty block creates one quote block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), "> Quote");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "> Quote",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["quote"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting single table markdown into an empty block creates one table block", async () => {
    const markdown = [
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["table"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting fenced code markdown into an empty block creates one code block", async () => {
    const markdown = [
      "```js",
      "const value = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting mixed code and paragraphs creates code paragraph paragraph code blocks", async () => {
    const markdown = [
      "```js",
      "const first = 1;",
      "```",
      "",
      "One",
      "",
      "Two",
      "",
      "```ts",
      "const second = 2;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100", "d1:b101", "d1:b102"]);
    expect(adapter.blockTypes).toEqual(["codeBlock", "paragraph", "paragraph", "codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting incomplete fenced code markdown keeps one incomplete code block", async () => {
    const markdown = [
      "```js",
      "const value = 1;",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles composition-like in-progress fenced code edits before final commit", async () => {
    const finalMarkdown = [
      "```js",
      "const value = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "```");
    await changeText(editorInput(renderer), "```js");
    await changeText(editorInput(renderer), "```js\nconst value = 1;");
    expect(adapter.applyTransactions).toEqual([]);

    await changeText(editorInput(renderer), finalMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: finalMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps an incomplete code fence stable while editing below it", async () => {
    const incompleteMarkdown = [
      "```ts",
      "const value = 1;",
      "- this remains code",
    ].join("\n");
    const completedMarkdown = `${incompleteMarkdown}\n\`\`\``;
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, incompleteMarkdown, "");
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);

    await replaceActiveMarkdown(renderer, completedMarkdown, incompleteMarkdown);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);

    await undo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe("");
    await expectStableEditingState(renderer, adapter);

    await redo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe(completedMarkdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("supports tilde fences and longer backtick runs inside code content", async () => {
    const markdown = [
      "~~~md",
      "```",
      "not a closing tilde fence",
      "```",
      "~~~",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps code block identity while deleting and re-adding the closing fence", async () => {
    const completeMarkdown = [
      "```js",
      "const value = 1;",
      "```",
    ].join("\n");
    const incompleteMarkdown = [
      "```js",
      "const value = 1;",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, completeMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, incompleteMarkdown, completeMarkdown);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);

    await replaceActiveMarkdown(renderer, completeMarkdown, incompleteMarkdown);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("converts an in-progress table into a table once the separator is valid", async () => {
    const headerMarkdown = "| A | B |";
    const malformedMarkdown = [
      "| A | B |",
      "| not a separator |",
    ].join("\n");
    const tableMarkdown = [
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, headerMarkdown, "");
    expect(adapter.blockTypes).toEqual(["paragraph"]);

    await replaceActiveMarkdown(renderer, malformedMarkdown, headerMarkdown);
    expect(adapter.blockTypes).toEqual(["paragraph"]);

    await replaceActiveMarkdown(renderer, tableMarkdown, malformedMarkdown);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["table"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("turns a table back into paragraph markdown when the separator is deleted", async () => {
    const tableMarkdown = [
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n");
    const paragraphMarkdown = [
      "| A | B |",
      "| 1 | 2 |",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([markdownBlock("d1:b0", 0, tableMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, paragraphMarkdown, tableMarkdown);

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["paragraph"]);
    expect(adapter.markdownById.get("d1:b0")).toBe(paragraphMarkdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["dash marker", "-", "paragraph"],
    ["dash marker with space", "- ", "unorderedList"],
    ["ordered marker", "1.", "paragraph"],
    ["ordered marker with space", "1. ", "orderedList"],
    ["task marker prefix", "- [", "unorderedList"],
    ["task marker", "- [ ] ", "unorderedList"],
    ["nested dash marker", "  - ", "unorderedList"],
  ])("handles in-progress list typing for %s", async (_label, markdown, expectedType) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual([expectedType]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes list marker transitions", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, "1. ", "");
    expect(adapter.blockTypes).toEqual(["orderedList"]);

    await undo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe("");
    expect(adapter.blockTypes).toEqual(["paragraph"]);

    await redo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe("1. ");
    expect(adapter.blockTypes).toEqual(["orderedList"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["empty blockquote marker", ">", "quote"],
    ["spaced empty blockquote marker", "> ", "quote"],
    ["blockquote content", "> Quote", "quote"],
    ["removed marker", "Quote", "paragraph"],
  ])("handles blockquote typing state for %s", async (_label, markdown, expectedType) => {
    const adapter = new MountedEditorAdapter(snapshot([quoteBlock("d1:b0", 0, "> Quote")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "> Quote");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual([expectedType]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["hash only", "#", "paragraph"],
    ["hashes only", "##", "paragraph"],
    ["heading marker", "## ", "heading"],
    ["heading content", "## Heading", "heading"],
    ["missing space", "##Heading", "paragraph"],
  ])("handles heading typing state for %s", async (_label, markdown, expectedType) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual([expectedType]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["single dash", "-", "paragraph"],
    ["double dash", "--", "paragraph"],
    ["triple dash", "---", "thematicBreak"],
    ["triple dash plus text", "--- text", "paragraph"],
    ["asterisks", "***", "thematicBreak"],
    ["underscores", "___", "thematicBreak"],
    ["spaced stars", "* * *", "thematicBreak"],
  ])("handles thematic break typing ambiguity for %s", async (_label, markdown, expectedType) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual([expectedType]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps mixed incomplete structures stable inside an incomplete code fence", async () => {
    const markdown = [
      "```md",
      "- list-looking line",
      "| A | B |",
      "|---|---|",
      "> quote-looking line",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["spaces and tabs", "   \n\t\n  "],
    ["blank LF lines", "\n\n\n"],
    ["blank CRLF lines", "\r\n\r\n"],
  ])("keeps whitespace-only multiline edits representable for %s", async (_label, markdown) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("");
    expect(adapter.blockTypes).toEqual(["paragraph"]);
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps a whitespace-only replacement active between sibling blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Second");
    await replaceActiveMarkdown(renderer, "\n \n", "Second");

    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expect(adapter.markdownById.get("d1:b1")).toBe("");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["mismatched backtick and tilde fences", "```js\nconst value = 1;\n~~~"],
    ["unclosed longer backtick fence", "````js\n``` inner fence\nconst value = 1;"],
    ["unterminated html comment", "<!-- unfinished comment"],
    ["unterminated frontmatter", "---\ntitle: Draft"],
    ["ragged table rows", "| A | B |\n|---|---|\n| 1 |\n| 2 | 3 | 4 |"],
    ["mdx-looking jsx", "<Component prop=\"value\">\n- child\n</Component>"],
    ["escaped markers", "\\---\n\\# heading\n\\- item"],
  ])("keeps malformed structural markdown representable for %s", async (_label, markdown) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");
    await expectRepresentableDocument(renderer, adapter);

    await undo(commandsRef);
    await expectRepresentableDocument(renderer, adapter);

    await redo(commandsRef);
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["null byte", "Before\u0000After"],
    ["unicode line separator", "Before\u2028After"],
    ["unicode paragraph separator", "Before\u2029After"],
    ["bidirectional control", "Before\u202eAfter"],
    ["zero-width joiners", "A\u200dB\u200cC"],
    ["object replacement character", "Before\ufffcAfter"],
  ])("keeps control-character input representable for %s", async (_label, markdown) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");

    expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps very long ambiguous marker-only lines representable", async () => {
    const markdown = `${"-".repeat(2000)} text`;
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["negative selection", -20, -10],
    ["reversed selection", 8, 2],
    ["far beyond selection", 1000, 2000],
    ["middle of surrogate pair", "😀".length - 1, "😀".length - 1],
    ["middle of combining sequence", "e".length, "e".length],
  ])("keeps text edits representable after an impossible %s range", async (_label, start, end) => {
    const originalMarkdown = _label.includes("surrogate")
      ? "😀 Original"
      : _label.includes("combining")
      ? "e\u0301 Original"
      : "Original";
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), start, end);
    await changeText(editorInput(renderer), "Edited after impossible selection");
    await runPendingTimers();

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Edited after impossible selection");
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["extremely long word", `${"a".repeat(10000)}`],
    ["deep nested list", `${"  ".repeat(50)}- deeply nested`],
    ["huge whitespace-only paste", `${" \n".repeat(500)}`],
    ["mixed tabs and spaces", "\t- tab item\n  \t- mixed child\n    - space child"],
    ["trailing hard-break spaces", "First line  \nSecond line    \nThird"],
    ["unpaired high surrogate", "Before \ud83d After"],
    ["unpaired low surrogate", "Before \ude00 After"],
    ["combining mark stack", `a${"\u0301".repeat(20)}`],
    ["emoji zwj sequence", "Family: 👨‍👩‍👧‍👦"],
    ["rtl marker stack", `RTL ${"\u202e".repeat(10)}text`],
  ])("keeps hostile text input representable for %s", async (_label, markdown) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");

    if (markdown.trim().length === 0) {
      expect(adapter.markdownById.get("d1:b0")).toBe("");
    } else {
      expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    }
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting multi-paragraph markdown over a text selection replaces the selection through the parser", async () => {
    const markdown = [
      "Before",
      "",
      "After",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Replace me")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0, "Replace me".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting multi-line list markdown into an existing single-line list updates one list block", async () => {
    const markdown = [
      "1. Existing",
      "2. Pasted first",
      "3. Pasted second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([orderedListBlock("d1:b0", 0, "1. Existing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "1. Existing".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["orderedList"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting fenced code markdown into an existing code block keeps the edit inside that code block", async () => {
    const originalMarkdown = [
      "```js",
      "const before = 1;",
      "```",
    ].join("\n");
    const nextMarkdown = [
      "```js",
      "const before = 1;",
      "```",
      "```ts",
      "const pasted = 2;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting fenced code markdown into a paragraph parses through document blocks", async () => {
    const markdown = [
      "Intro",
      "",
      "```js",
      "const pasted = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Intro")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "Intro".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph", "codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting fenced code markdown into a list item parses through document blocks", async () => {
    const markdown = [
      "- Item",
      "",
      "```js",
      "const pasted = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, "- Item")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- Item".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["unorderedList", "codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting multiple list items inside an existing list item keeps one list block", async () => {
    const markdown = [
      "- Existing pasted first",
      "- Pasted second",
      "- Pasted third",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, "- Existing")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- Existing".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual(["unorderedList"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting mixed heading paragraph list code and quote parses all block types", async () => {
    const markdown = [
      "# Heading",
      "",
      "Paragraph",
      "",
      "- Item",
      "- Item two",
      "",
      "```js",
      "const value = 1;",
      "```",
      "",
      "> Quote",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["heading", "paragraph", "unorderedList", "codeBlock", "quote"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting CRLF markdown normalizes into parsed markdown blocks", async () => {
    const markdown = "First\r\n\r\nSecond\r\n\r\n```js\r\nconst value = 1;\r\n```";
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph", "codeBlock"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting mixed CRLF LF and lone CR markdown parses stable block boundaries", async () => {
    const markdown = "First\r\n\r\nSecond\n\n> Quote\r\r```js\rconst value = 1;\r```";
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph", "quote", "codeBlock"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["large code block", ["```js", ...Array.from({ length: 140 }, (_value, index) => `const value${index} = ${index};`), "```"].join("\n"), "codeBlock"],
    ["large ordered list", Array.from({ length: 140 }, (_value, index) => `${index + 1}. Item ${index}`).join("\n"), "orderedList"],
    ["large table", [
      "| A | B |",
      "|---|---|",
      ...Array.from({ length: 140 }, (_value, index) => `| ${index} | ${index + 1} |`),
    ].join("\n"), "table"],
  ])("edits a %s without splitting or losing active state", async (_label, markdown, expectedType) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.blockTypes).toEqual([expectedType]);
    expect(adapter.markdownById.get("d1:b0")).toBe(markdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pastes adjacent structural blocks and preserves them through undo and redo", async () => {
    const markdown = [
      "```js",
      "const value = 1;",
      "```",
      "",
      "- Item",
      "- Item two",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "> Quote",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, markdown, "Original");
    expect(adapter.blockTypes).toEqual(["codeBlock", "unorderedList", "table", "quote"]);
    await expectStableEditingState(renderer, adapter);

    await undo(commandsRef);
    expect(adapter.sourceMarkdown).toBe("Original");
    await expectStableEditingState(renderer, adapter);

    await redo(commandsRef);
    expect(adapter.blockTypes).toEqual(["codeBlock", "unorderedList", "table", "quote"]);
    expect(adapter.sourceMarkdown).toBe(markdown);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pasting huge markdown far down in the document updates the intended block only", async () => {
    const blocks = Array.from({ length: 160 }, (_value, index) => block(`d1:b${index}`, index, `Block ${index}`));
    const targetMarkdown = "Block 140";
    const pastedMarkdown = Array.from({ length: 30 }, (_value, index) => `Pasted paragraph ${index}`).join("\n\n");
    const adapter = new MountedEditorAdapter(snapshot(blocks));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, targetMarkdown);
    await changeSelection(editorInput(renderer), targetMarkdown.length);
    await changeText(editorInput(renderer), pastedMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b140",
        markdown: pastedMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b139")).toBe("Block 139");
    expect(adapter.markdownById.get("d1:b0")).toBe("Block 0");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes a huge paste far down in the document", async () => {
    const blocks = Array.from({ length: 160 }, (_value, index) => block(`d1:b${index}`, index, `Block ${index}`));
    const targetMarkdown = "Block 140";
    const pastedMarkdown = Array.from({ length: 30 }, (_value, index) => `Pasted paragraph ${index}`).join("\n\n");
    const adapter = new MountedEditorAdapter(snapshot(blocks));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, targetMarkdown);
    await changeSelection(editorInput(renderer), targetMarkdown.length);
    await changeText(editorInput(renderer), pastedMarkdown);
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toContain("Block 140");
    expect(adapter.sourceMarkdown).not.toContain("Pasted paragraph 0");
    expectUniqueBlockIds(adapter);

    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toContain("Pasted paragraph 0");
    expect(adapter.sourceMarkdown).toContain("Pasted paragraph 29");
    expect(adapter.sourceMarkdown).toContain("Block 141");
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores stale text-change events after a code-block boundary split", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });
    const staleOnChangeText = editorInput(renderer).props.onChangeText;

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await act(async () => {
      staleOnChangeText(`${originalMarkdown}\n`);
    });
    await flushPromises();
    await act(async () => {
      staleOnChangeText(`${originalMarkdown}\nstale`);
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: originalMarkdown,
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("focuses the next markdown block with the navigation command", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await focusNextBlock(commandsRef);

    expect(adapter.applyTransactions).toEqual([]);
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("focuses the previous markdown block with the navigation command", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Second");
    await focusPreviousBlock(commandsRef);

    expect(adapter.applyTransactions).toEqual([]);
    expect(editorInput(renderer).props.defaultValue).toBe("First");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not navigate past the first or last markdown block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await focusPreviousBlock(commandsRef);
    expect(editorInput(renderer).props.defaultValue).toBe("First");

    await pressRenderedMarkdown(renderer, "Second");
    await focusNextBlock(commandsRef);
    expect(editorInput(renderer).props.defaultValue).toBe("Second");

    expect(adapter.applyTransactions).toEqual([]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("focuses adjacent blocks when the native editor reports vertical navigation outside", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "Previous"),
      block("d1:b1", 1, "First line\nSecond line"),
      block("d1:b2", 2, "Next"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "First line\nSecond line");
    await navigateVerticallyOutside(renderer, "up");
    expect(editorInput(renderer).props.defaultValue).toBe("Previous");

    await pressRenderedMarkdown(renderer, "First line\nSecond line");
    await navigateVerticallyOutside(renderer, "down");
    expect(editorInput(renderer).props.defaultValue).toBe("Next");

    expect(adapter.applyTransactions).toEqual([]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("commits a pending draft before focusing the next markdown block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await focusNextBlock(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First edited",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("First edited");
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("focuses the first and last markdown blocks with boundary navigation commands", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Second");
    await focusLastBlock(commandsRef);
    expect(editorInput(renderer).props.defaultValue).toBe("Third");

    await focusFirstBlock(commandsRef);
    expect(editorInput(renderer).props.defaultValue).toBe("First");

    expect(adapter.applyTransactions).toEqual([]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not extend block selection when the text selection is not at a boundary", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 2);

    await expect(extendBlockSelectionUp(commandsRef)).resolves.toBe(false);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(false);

    expect(adapter.applyTransactions).toEqual([]);
    expect(editorInput(renderer).props.defaultValue).toBe("First");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("extends block selection downward from the end of the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First".length);

    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b2",
        placement: "after",
        startBlockId: "d1:b0",
        targetBlockId: "d1:b3",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b3", "d1:b0", "d1:b1", "d1:b2"]);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders block selection highlights inside the selected block rows", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First".length);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);

    expectBlockSelectionOverlays(renderer, ["d1:b0", "d1:b1"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders block selection highlights above opaque rendered block backgrounds", async () => {
    const codeMarkdown = "```ts\nconst selected = true;\n```";
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      codeBlock("d1:b1", 1, codeMarkdown),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First".length);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);

    const renderedCodeIndex = renderedNodeIndex(renderer, (node) => node.props.markdown === codeMarkdown);
    const codeOverlayIndex = renderedNodeIndex(
      renderer,
      (node) => String(node.type) === "View" && node.props.testID === "markdown-block-selection-overlay-d1:b1",
    );
    expect(renderedCodeIndex).toBeGreaterThanOrEqual(0);
    expect(codeOverlayIndex).toBeGreaterThan(renderedCodeIndex);
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders the selection toolbar from the list footer instead of the anchor row", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const selectionToolbarAnchor = {
      blockId: "d1:recycled",
      height: 25,
      itemHeight: 25,
      itemWidth: 640,
      itemX: 32,
      itemY: 96,
      kind: "blockSelection" as const,
      width: 640,
      x: 32,
      y: 96,
    };
    const renderSelectionToolbar = jest.fn(() => (
      <View testID="markdown-selection-toolbar" />
    ));
    const { onError, renderer } = await renderDocument({
      adapter,
      documentProps: {
        renderSelectionToolbar,
        selectionToolbarAnchor,
      },
    });

    expect(renderSelectionToolbar).toHaveBeenCalledWith(selectionToolbarAnchor);
    expect(renderer.root.findAll((node) => (
      String(node.type) === "View" && node.props.testID === "markdown-selection-toolbar"
    ))).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: "legend-list-footer" }).props.style).toEqual(
      expect.objectContaining({ position: "absolute" }),
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it("expands block selection highlights as the selection range grows", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First".length);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);
    expectBlockSelectionOverlays(renderer, ["d1:b0", "d1:b1"]);

    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);

    expectBlockSelectionOverlays(renderer, ["d1:b0", "d1:b1", "d1:b2"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders upward block selection highlights in document order", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Third");
    await changeSelection(editorInput(renderer), 0);
    await expect(extendBlockSelectionUp(commandsRef)).resolves.toBe(true);

    expectBlockSelectionOverlays(renderer, ["d1:b1", "d1:b2"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("clears block selection highlights when another block is activated", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First".length);
    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);
    expectBlockSelectionOverlays(renderer, ["d1:b0", "d1:b1"]);

    await pressRenderedMarkdown(renderer, "Third");

    expectBlockSelectionOverlays(renderer, []);
    expect(editorInput(renderer).props.defaultValue).toBe("Third");
    expect(onError).not.toHaveBeenCalled();
  });

  it("commits a pending draft before extending block selection from the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await changeSelection(editorInput(renderer), "First edited".length);

    await expect(extendBlockSelectionDown(commandsRef)).resolves.toBe(true);
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First edited",
        type: "updateBlockMarkdown",
      },
      {
        endBlockId: "d1:b1",
        placement: "after",
        startBlockId: "d1:b0",
        targetBlockId: "d1:b2",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("First edited");
    expect(adapter.blockIds).toEqual(["d1:b2", "d1:b0", "d1:b1"]);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("extends block selection upward from the start of the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Third");
    await changeSelection(editorInput(renderer), 0);

    await expect(extendBlockSelectionUp(commandsRef)).resolves.toBe(true);
    await moveActiveBlockUp(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b2",
        placement: "before",
        startBlockId: "d1:b1",
        targetBlockId: "d1:b0",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b2", "d1:b0", "d1:b3"]);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves the active block up and keeps it active", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Second");
    await moveActiveBlockUp(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        placement: "before",
        startBlockId: "d1:b1",
        targetBlockId: "d1:b0",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b0", "d1:b2"]);
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves the active block down and keeps it active", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b0",
        placement: "after",
        startBlockId: "d1:b0",
        targetBlockId: "d1:b1",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b0", "d1:b2"]);
    expect(editorInput(renderer).props.defaultValue).toBe("First");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves the current block selection up as a range", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "Second", "down");
    await moveActiveBlockUp(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b2",
        placement: "before",
        startBlockId: "d1:b1",
        targetBlockId: "d1:b0",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b2", "d1:b0", "d1:b3"]);
    expect(() => blockSelectionInput(renderer)).not.toThrow();
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves the current block selection down as a range", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        placement: "after",
        startBlockId: "d1:b0",
        targetBlockId: "d1:b2",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b2", "d1:b0", "d1:b1", "d1:b3"]);
    expect(() => blockSelectionInput(renderer)).not.toThrow();
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not move selected block ranges past document boundaries", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await moveActiveBlockUp(commandsRef);
    await dragSelectionOutside(renderer, "Second", "down");
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes moving the current block selection", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await moveActiveBlockDown(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b2", "d1:b0", "d1:b1", "d1:b3"]);

    await undo(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2", "d1:b3"]);
    expect(() => blockSelectionInput(renderer)).not.toThrow();

    await redo(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b2", "d1:b0", "d1:b1", "d1:b3"]);
    expect(() => blockSelectionInput(renderer)).not.toThrow();
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not move active blocks past document boundaries", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await moveActiveBlockUp(commandsRef);
    await pressRenderedMarkdown(renderer, "Second");
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([]);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("commits a pending active draft before moving the block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await moveActiveBlockDown(commandsRef);

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First edited",
        type: "updateBlockMarkdown",
      },
      {
        endBlockId: "d1:b0",
        placement: "after",
        startBlockId: "d1:b0",
        targetBlockId: "d1:b1",
        type: "moveBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("First edited");
    expect(editorInput(renderer).props.defaultValue).toBe("First edited");
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes moving the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await moveActiveBlockDown(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b0", "d1:b2"]);

    await undo(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expect(editorInput(renderer).props.defaultValue).toBe("First");
    await expectStableEditingState(renderer, adapter);

    await redo(commandsRef);
    expect(adapter.blockIds).toEqual(["d1:b1", "d1:b0", "d1:b2"]);
    expect(editorInput(renderer).props.defaultValue).toBe("First");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves mixed markdown block types without changing their identities", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      markdownBlock("d1:b0", 0, "## Heading"),
      orderedListBlock("d1:b1", 1, "1. One\n2. Two"),
      codeBlock("d1:b2", 2, "```ts\nconst value = 1;\n```"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "```ts\nconst value = 1;\n```");
    await moveActiveBlockUp(commandsRef);

    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b2", "d1:b1"]);
    expect(adapter.blockTypes).toEqual(["heading", "codeBlock", "orderedList"]);
    expect(editorInput(renderer).props.defaultValue).toBe("```ts\nconst value = 1;\n```");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("moves a far-down active block without disturbing earlier siblings", async () => {
    const blocks = Array.from({ length: 160 }, (_value, index) => block(`d1:b${index}`, index, `Block ${index}`));
    const adapter = new MountedEditorAdapter(snapshot(blocks));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Block 140");
    await moveActiveBlockUp(commandsRef);

    expect(adapter.blockIds[139]).toBe("d1:b140");
    expect(adapter.blockIds[140]).toBe("d1:b139");
    expect(adapter.blockIds[0]).toBe("d1:b0");
    expect(editorInput(renderer).props.defaultValue).toBe("Block 140");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("applies formatting commands to the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Title")]));
    const { commandsRef, onError } = await renderDocument({ adapter });

    await act(async () => {
      commandsRef.current?.setHeading(2);
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.toggleBlockquote();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "## Title",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "> ## Title",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("> ## Title");
    expect(onError).not.toHaveBeenCalled();
  });

  it("formats the current draft instead of stale committed markdown", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Draft edit");
    await act(async () => {
      commandsRef.current?.setHeading(1);
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "# Draft edit",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("can strip formatting back to a paragraph", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "## Heading")]));
    const { commandsRef, onError } = await renderDocument({ adapter });

    await act(async () => {
      commandsRef.current?.setParagraph();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Heading",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes active block updates", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Edited",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Original",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Edited",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Edited");
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes editing the active block to empty markdown", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), "");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("");
    expectActiveBlockExists(renderer, adapter);

    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Original");
    expectActiveBlockExists(renderer, adapter);

    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(adapter.markdownById.get("d1:b0")).toBe("");
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes a paragraph split", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "Original\nInserted");
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toHaveLength(3);
    expect(adapter.applyTransactions[0]).toEqual({
      afterMarkdown: "Inserted",
      beforeMarkdown: "Original",
      blockId: "d1:b0",
      type: "splitBlock",
    });
    expect(adapter.applyTransactions[1]).toMatchObject({
      markdown: "Original",
      type: "replaceBlockRange",
    });
    expect(adapter.applyTransactions[2]).toMatchObject({
      markdown: "Original\n\nInserted",
      type: "replaceBlockRange",
    });
    expect(adapter.sourceMarkdown).toBe("Original\n\nInserted");
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes a paste that creates multiple blocks", async () => {
    const markdown = [
      "First",
      "",
      "Second",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0, "Original".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph"]);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes deleting a block selection", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await act(async () => {
      blockSelectionInput(renderer).props.onKeyPress({ nativeEvent: { key: "Backspace" } });
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toBe("Third");
    expect(adapter.blockIds).toHaveLength(1);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes exiting an empty list item", async () => {
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, "- ")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- ".length);
    await changeText(editorInput(renderer), "- \n");
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toBe("");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes a code-block boundary split", async () => {
    const originalMarkdown = "```\nconst value = 1;\n```";
    const adapter = new MountedEditorAdapter(snapshot([codeBlock("d1:b0", 0, originalMarkdown)]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), originalMarkdown.length);
    await changeText(editorInput(renderer), `${originalMarkdown}\n`);
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toBe(`${originalMarkdown}\n\n`);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("publishes command state changes for undo and redo availability", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const onCommandStateChange = jest.fn();
    const { commandsRef, renderer } = await renderDocument({ adapter, onCommandStateChange });

    await changeText(editorInput(renderer), "Edited");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();

    expect(onCommandStateChange).toHaveBeenCalledWith({ canRedo: false, canUndo: true });
    expect(onCommandStateChange).toHaveBeenCalledWith({ canRedo: true, canUndo: false });
  });

  it("replaces a dragged block selection with typed text", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await changeText(blockSelectionInput(renderer), "Replacement");

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        markdown: "Replacement",
        startBlockId: "d1:b0",
        type: "replaceBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b100", "d1:b2"]);
    expect(editorInput(renderer).props.defaultValue).toBe("Replacement");
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces a dragged block selection with whitespace as an editable empty block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await changeText(blockSelectionInput(renderer), "\n \n");

    expect(adapter.blockIds).toEqual(["d1:b100", "d1:b2"]);
    expect(adapter.markdownById.get("d1:b100")).toBe("");
    expect(editorInput(renderer).props.defaultValue).toBe("");
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces selected text inside a multiline block", async () => {
    const originalMarkdown = [
      "First line",
      "Second line",
      "Third line",
    ].join("\n");
    const nextMarkdown = [
      "First line",
      "Replacement",
      "Third line",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, originalMarkdown)]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "First line\n".length, "First line\nSecond line".length);
    await changeText(editorInput(renderer), nextMarkdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: nextMarkdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces selected text inside a block with pasted markdown through the parser", async () => {
    const markdown = [
      "Before",
      "",
      "Pasted",
      "",
      "After",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Before selected After")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "Before ".length, "Before selected".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces a selection at the start of a block with pasted markdown", async () => {
    const markdown = [
      "First",
      "",
      "Second tail",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "selected tail")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), 0, "selected".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["paragraph", "paragraph"]);
    expect(adapter.sourceMarkdown).toBe("First\n\nSecond tail");
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces selected list item content with pasted markdown around the marker", async () => {
    const markdown = [
      "- Replacement",
      "",
      "Paragraph",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([unorderedListBlock("d1:b0", 0, "- selected item")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "- ".length, "- selected item".length);
    await changeText(editorInput(renderer), markdown);
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown,
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["unorderedList", "paragraph"]);
    expect(adapter.sourceMarkdown).toBe("- Replacement\n\nParagraph");
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces a block selection with pasted mixed markdown", async () => {
    const markdown = [
      "# Replacement",
      "",
      "- Item",
      "",
      "```js",
      "const value = 1;",
      "```",
    ].join("\n");
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await changeText(blockSelectionInput(renderer), markdown);

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        markdown,
        startBlockId: "d1:b0",
        type: "replaceBlockRange",
      },
    ]);
    expect(adapter.blockTypes).toEqual(["heading", "unorderedList", "codeBlock", "paragraph"]);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("pressing enter on a block selection deletes the selected blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await act(async () => {
      blockSelectionInput(renderer).props.onKeyPress({ nativeEvent: { key: "Enter" } });
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        markdown: "",
        startBlockId: "d1:b0",
        type: "replaceBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b2"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("deletes a dragged block selection on backspace", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await act(async () => {
      blockSelectionInput(renderer).props.onKeyPress({ nativeEvent: { key: "Backspace" } });
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        endBlockId: "d1:b1",
        markdown: "",
        startBlockId: "d1:b0",
        type: "replaceBlockRange",
      },
    ]);
    expect(adapter.blockIds).toEqual(["d1:b2"]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes and redoes a typed block selection replacement", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await changeText(blockSelectionInput(renderer), "Replacement");
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.applyTransactions[0]).toEqual(
      {
        endBlockId: "d1:b1",
        markdown: "Replacement",
        startBlockId: "d1:b0",
        type: "replaceBlockRange",
      },
    );
    expect(adapter.applyTransactions).toHaveLength(3);
    expect(adapter.sourceMarkdown).toBe("Replacement\n\nThird");
    expect(onError).not.toHaveBeenCalled();
  });

  it("undoes a deleted block selection", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await act(async () => {
      blockSelectionInput(renderer).props.onKeyPress({ nativeEvent: { key: "Backspace" } });
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();

    expect(adapter.sourceMarkdown).toBe("First\n\nSecond\n\nThird");
    expect(onError).not.toHaveBeenCalled();
  });

  it("commits an active draft before undoing the latest edit", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Draft");
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Draft",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Original",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Original");
    expect(onError).not.toHaveBeenCalled();
  });

  it("clears redo history after undo followed by a new edit", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edit");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await changeText(editorInput(renderer), "Second edit");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "First edit",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Original",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Second edit",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Second edit");
    expect(onError).not.toHaveBeenCalled();
  });

  it("edits the first block without affecting later blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await runPendingTimers();

    expect(adapter.markdownById.get("d1:b0")).toBe("First edited");
    expect(adapter.markdownById.get("d1:b1")).toBe("Second");
    expect(adapter.markdownById.get("d1:b2")).toBe("Third");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("edits the last block without affecting earlier blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, "Third");
    await changeText(editorInput(renderer), "Third edited");
    await runPendingTimers();

    expect(adapter.markdownById.get("d1:b0")).toBe("First");
    expect(adapter.markdownById.get("d1:b1")).toBe("Second");
    expect(adapter.markdownById.get("d1:b2")).toBe("Third edited");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("edits the only block and keeps it active", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Only")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Only edited");
    await runPendingTimers();

    expect(adapter.blockIds).toEqual(["d1:b0"]);
    expectActiveBlockExists(renderer, adapter);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["first", "First", "d1:b0"],
    ["middle", "Second", "d1:b1"],
    ["last", "Third", "d1:b2"],
  ])("keeps an emptied %s block active next to siblings", async (_label, targetMarkdown, targetBlockId) => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await pressRenderedMarkdown(renderer, targetMarkdown);
    await changeSelection(editorInput(renderer), 0, targetMarkdown.length);
    await changeText(editorInput(renderer), "");
    await runPendingTimers();

    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b1", "d1:b2"]);
    expect(adapter.markdownById.get(targetBlockId)).toBe("");
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("edits the block after deleting previous siblings", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await act(async () => {
      blockSelectionInput(renderer).props.onKeyPress({ nativeEvent: { key: "Backspace" } });
    });
    await flushPromises();
    await pressRenderedMarkdown(renderer, "Third");
    await changeText(editorInput(renderer), "Third edited");
    await runPendingTimers();

    expect(adapter.sourceMarkdown).toBe("Third edited");
    expect(adapter.blockIds).toHaveLength(1);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles selection and text events arriving in old-length then new-text order", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "Original extended");
    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "Original extended again");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Original extended again",
        type: "updateBlockMarkdown",
      },
    ]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles text and selection events arriving in new-text then old-length order", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Original extended");
    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "Original extended final");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Original extended final",
        type: "updateBlockMarkdown",
      },
    ]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles selection races around a structural split without stale active state", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });
    const staleOnChangeSelection = editorInput(renderer).props.onChangeSelection;

    await changeSelection(editorInput(renderer), "Original".length);
    await changeText(editorInput(renderer), "Original\nSplit");
    await act(async () => {
      staleOnChangeSelection({ end: 0, start: 0 });
    });
    await flushPromises();
    await changeText(editorInput(renderer), "Split edited");
    await runPendingTimers();

    expect(adapter.sourceMarkdown).toBe("Original\n\nSplit edited");
    expect(adapter.blockIds).toEqual(["d1:b0", "d1:b100"]);
    await expectStableEditingState(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["update", async (renderer: TestRenderer.ReactTestRenderer) => {
      await changeText(editorInput(renderer), "Edited");
      await runPendingTimers();
    }],
    ["split", async (renderer: TestRenderer.ReactTestRenderer) => {
      await changeSelection(editorInput(renderer), "Original".length);
      await changeText(editorInput(renderer), "Original\nSplit");
      await flushPromises();
    }],
  ])("recovers when an adapter transaction throws during %s", async (_label, runEdit) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    adapter.failNextTransaction = new Error("transaction failed");
    const { onError, renderer } = await renderDocument({ adapter });

    await runEdit(renderer);

    expect(adapter.sourceMarkdown).toBe("Original");
    expectUniqueBlockIds(adapter);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "transaction failed" }));
  });

  it("recovers when an adapter transaction throws during range replacement", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
      block("d1:b2", 2, "Third"),
    ]));
    adapter.failNextTransaction = new Error("range transaction failed");
    const { onError, renderer } = await renderDocument({ adapter, autoFocusFirstBlock: false });

    await dragSelectionOutside(renderer, "First", "down");
    await changeText(blockSelectionInput(renderer), "Replacement");

    expect(adapter.sourceMarkdown).toBe("First\n\nSecond\n\nThird");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "range transaction failed" }));
    expectUniqueBlockIds(adapter);
  });

  it("does not add failed transactions to undo history", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    adapter.failNextTransaction = new Error("transaction failed");
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Failed edit");
    await runPendingTimers();
    await changeText(editorInput(renderer), "Successful edit");
    await runPendingTimers();

    expect(adapter.markdownById.get("d1:b0")).toBe("Successful edit");

    await undo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe("Original");

    await redo(commandsRef);
    expect(adapter.markdownById.get("d1:b0")).toBe("Successful edit");
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "transaction failed" }));
  });

  it("waits for a pending edit transaction before save completes", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const transactionGate = adapter.deferNextTransaction();
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited while saving");
    let savePromise: Promise<void> | undefined;
    await act(async () => {
      savePromise = commandsRef.current?.save();
      await Promise.resolve();
    });

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Edited while saving",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.saveCount).toBe(0);

    transactionGate.resolve();
    await act(async () => {
      await savePromise;
    });
    await flushPromises();

    expect(adapter.markdownById.get("d1:b0")).toBe("Edited while saving");
    expect(adapter.saveCount).toBe(1);
    expect(adapter.saveRevisions).toEqual([1]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the newly focused block active while the previous block transaction is pending", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const transactionGate = adapter.deferNextTransaction();
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "First edited");
    await pressRenderedMarkdown(renderer, "Second");

    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    expect(adapter.markdownById.get("d1:b0")).toBe("First");

    transactionGate.resolve();
    await flushPromises();

    expect(adapter.markdownById.get("d1:b0")).toBe("First edited");
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    await expectRepresentableDocument(renderer, adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("handles unmount while a debounced edit transaction is pending", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const transactionGate = adapter.deferNextTransaction();
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Pending edit");
    await act(async () => {
      jest.runOnlyPendingTimers();
      await Promise.resolve();
    });
    expect(adapter.applyTransactions).toHaveLength(1);

    await act(async () => {
      renderer.unmount();
    });
    transactionGate.resolve();
    await flushPromises();

    expect(adapter.markdownById.get("d1:b0")).toBe("Pending edit");
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancels a debounced edit when unmounted before the timer fires", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Uncommitted");
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Original");
    expect(onError).not.toHaveBeenCalled();
  });

  it("continues editing after saving reloading and reopening a weird document state", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await replaceActiveMarkdown(renderer, "Before \ud83d After\n\n```js\nconst value = 1;\n```", "Original");
    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();

    const reloadedAdapter = new MountedEditorAdapter(snapshot(adapter.blockSnapshots));
    const reloaded = await renderDocument({ adapter: reloadedAdapter });
    await changeText(editorInput(reloaded.renderer), "Reloaded edit");
    await runPendingTimers();

    expect(reloadedAdapter.markdownById.get("d1:b0")).toBe("Reloaded edit");
    await expectRepresentableDocument(reloaded.renderer, reloadedAdapter);
    expect(onError).not.toHaveBeenCalled();
    expect(reloaded.onError).not.toHaveBeenCalled();
  });

  it.each([
    [
      "duplicate changed range ids",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [
          result.changedBlocks[0]!,
          { ...result.changedBlocks[0]!, id: result.changedBlocks[0]!.id },
        ],
        changedRange: {
          ...result.changedRange,
          blockIds: [result.changedBlocks[0]!.id, result.changedBlocks[0]!.id],
        },
      }),
      "duplicate",
    ],
    [
      "missing changed block snapshot",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [],
      }),
      "do not match",
    ],
    [
      "empty changed block id",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [{ ...result.changedBlocks[0]!, id: "" }],
        changedRange: { ...result.changedRange, blockIds: [""] },
      }),
      "empty id",
    ],
    [
      "empty changed block type",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [{ ...result.changedBlocks[0]!, type: "" }],
      }),
      "empty type",
    ],
    [
      "out-of-bounds changed range",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedRange: { ...result.changedRange, startBlockIndex: 99 },
      }),
      "out of bounds",
    ],
    [
      "retired id reused by changed block",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        retiredBlockIds: [result.changedBlocks[0]!.id],
      }),
      "retired",
    ],
    [
      "changed block order mismatch",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [
          { ...result.changedBlocks[0]!, id: "d1:b101", index: result.changedBlocks[0]!.index },
          result.changedBlocks[0]!,
        ],
        changedRange: {
          ...result.changedRange,
          blockIds: [result.changedBlocks[0]!.id, "d1:b101"],
        },
      }),
      "order",
    ],
    [
      "changed block index mismatch",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [{ ...result.changedBlocks[0]!, index: 10 }],
      }),
      "index",
    ],
    [
      "changed block source range exceeds source length",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [{ ...result.changedBlocks[0]!, sourceEndByte: result.sourceLength + 1 }],
      }),
      "source range",
    ],
    [
      "changed block content range exceeds source length",
      (result: MarkdownTransactionResult): MarkdownTransactionResult => ({
        ...result,
        changedBlocks: [{ ...result.changedBlocks[0]!, contentEndByte: result.sourceLength + 1 }],
      }),
      "content range",
    ],
  ])("rejects malformed adapter transaction results with %s", async (_label, mutateResult, expectedMessage) => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    adapter.mutateNextTransactionResult = mutateResult;
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited");
    await runPendingTimers();

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining(expectedMessage),
    }));
  });

  it("coalesces rapid sequential text events from the same block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edit 1");
    await changeText(editorInput(renderer), "Edit 2");
    await changeText(editorInput(renderer), "Edit 3");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Edit 3",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("duplicate native text events do not create duplicate transactions", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Duplicate");
    await changeText(editorInput(renderer), "Duplicate");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Duplicate",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts text events after save commits the active draft", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Saved");
    await act(async () => {
      await commandsRef.current?.save();
    });
    await flushPromises();
    await changeText(editorInput(renderer), "Saved again");
    await runPendingTimers();

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "Saved",
        type: "updateBlockMarkdown",
      },
      {
        blockId: "d1:b0",
        markdown: "Saved again",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.markdownById.get("d1:b0")).toBe("Saved again");
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores stale text events after switching the active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const { onError, renderer } = await renderDocument({ adapter });
    const staleOnChangeText = editorInput(renderer).props.onChangeText;

    await pressRenderedMarkdown(renderer, "Second");
    await act(async () => {
      staleOnChangeText("First stale");
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([]);
    expect(editorInput(renderer).props.defaultValue).toBe("Second");
    expect(onError).not.toHaveBeenCalled();
  });

  it("applies text events after undo to the restored active block state", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await changeText(editorInput(renderer), "Restored edit");
    await runPendingTimers();

    expect(adapter.markdownById.get("d1:b0")).toBe("Restored edit");
    expect(onError).not.toHaveBeenCalled();
  });

  it("applies text events after redo to the redone active block state", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Edited");
    await runPendingTimers();
    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    await act(async () => {
      commandsRef.current?.redo();
    });
    await flushPromises();
    await changeText(editorInput(renderer), "Redone edit");
    await runPendingTimers();

    expect(adapter.markdownById.get("d1:b0")).toBe("Redone edit");
    expect(onError).not.toHaveBeenCalled();
  });

  it("maintains block invariants across a deterministic edit sequence", async () => {
    const adapter = new MountedEditorAdapter(snapshot([
      block("d1:b0", 0, "Alpha"),
      block("d1:b1", 1, "Beta"),
      block("d1:b2", 2, "Gamma"),
    ]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    await changeText(editorInput(renderer), "Alpha edited");
    await runPendingTimers();
    expectUniqueBlockIds(adapter);
    expectActiveBlockExists(renderer, adapter);

    await changeSelection(editorInput(renderer), "Alpha".length);
    await changeText(editorInput(renderer), "Alpha\nsplit");
    expectUniqueBlockIds(adapter);
    expectActiveBlockExists(renderer, adapter);

    await act(async () => {
      commandsRef.current?.undo();
    });
    await flushPromises();
    expectUniqueBlockIds(adapter);
    expectActiveBlockExists(renderer, adapter);

    await pressRenderedMarkdown(renderer, "Beta");
    await changeText(editorInput(renderer), "Beta edited");
    await runPendingTimers();
    expectUniqueBlockIds(adapter);
    expectActiveBlockExists(renderer, adapter);

    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps parser-model invariants for generated simple markdown updates", async () => {
    const cases = [
      "Plain text",
      "# Heading",
      "- Item\n- Item two",
      "> Quote\n> Quote two",
      "```js\nconst value = 1;\n```",
      "---",
    ];
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    for (const markdown of cases) {
      await changeText(editorInput(renderer), markdown);
      await runPendingTimers();
      expectUniqueBlockIds(adapter);
      expectActiveBlockExists(renderer, adapter);
    }

    expect(onError).not.toHaveBeenCalled();
  });

  it("maintains invariants while undoing and redoing twenty structural edits", async () => {
    const structuralEdits = Array.from({ length: 20 }, (_value, index) => {
      const editIndex = index + 1;
      if (index % 4 === 0) {
        return [
          "```js",
          `const value = ${editIndex};`,
          "```",
        ].join("\n");
      }
      if (index % 4 === 1) {
        return [
          `${editIndex}. Item ${editIndex}`,
          `${editIndex + 1}. Item ${editIndex + 1}`,
        ].join("\n");
      }
      if (index % 4 === 2) {
        return [
          "| A | B |",
          "|---|---|",
          `| ${editIndex} | ${editIndex + 1} |`,
        ].join("\n");
      }
      return [
        "> Quote",
        "> Continued",
      ].join("\n");
    });
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { commandsRef, onError, renderer } = await renderDocument({ adapter });

    let previousMarkdown = "Original";
    for (const markdown of structuralEdits) {
      await replaceActiveMarkdown(renderer, markdown, previousMarkdown);
      previousMarkdown = markdown;
      expect(adapter.blockIds).toEqual(["d1:b0"]);
      await expectStableEditingState(renderer, adapter);
    }

    for (let index = 0; index < structuralEdits.length; index += 1) {
      await undo(commandsRef);
      expect(adapter.blockIds).toEqual(["d1:b0"]);
      await expectStableEditingState(renderer, adapter);
    }
    expect(adapter.markdownById.get("d1:b0")).toBe("Original");

    for (let index = 0; index < structuralEdits.length; index += 1) {
      await redo(commandsRef);
      expect(adapter.blockIds).toEqual(["d1:b0"]);
      await expectStableEditingState(renderer, adapter);
    }
    expect(adapter.markdownById.get("d1:b0")).toBe(structuralEdits[structuralEdits.length - 1]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps adapter invariants for generated edit split paste undo redo sequences", async () => {
    const generatedDocs = [
      [block("d1:b0", 0, "Alpha")],
      [
        block("d1:b0", 0, "Alpha"),
        unorderedListBlock("d1:b1", 1, "- Beta"),
        codeBlock("d1:b2", 2, "```js\nconst gamma = 1;\n```"),
      ],
      [
        markdownBlock("d1:b0", 0, "# Heading"),
        markdownBlock("d1:b1", 1, "> Quote"),
      ],
    ];
    const markdownCases = [
      "Plain generated edit",
      "- Generated item\n- Generated item two",
      "```js\nconst generated = true;\n```",
      "> Generated quote\n> continued",
      "| A | B |\n|---|---|\n| 1 | 2 |",
      "First generated\nSecond generated",
    ];

    for (const [docIndex, initialBlocks] of generatedDocs.entries()) {
      const adapter = new MountedEditorAdapter(snapshot(initialBlocks));
      const { commandsRef, onError, renderer } = await renderDocument({ adapter });

      for (let step = 0; step < 24; step += 1) {
        const operation = (step + docIndex) % 6;
        const currentMarkdown = editorInput(renderer).props.defaultValue;
        if (operation === 0) {
          await replaceActiveMarkdown(renderer, markdownCases[(step + docIndex) % markdownCases.length], currentMarkdown);
        } else if (operation === 1) {
          await changeSelection(editorInput(renderer), currentMarkdown.length);
          await changeText(editorInput(renderer), `${currentMarkdown}\nTail ${step}`);
          await flushPromises();
        } else if (operation === 2) {
          await replaceActiveMarkdown(renderer, `Edit ${docIndex}-${step}`, currentMarkdown);
        } else if (operation === 3) {
          await undo(commandsRef);
        } else if (operation === 4) {
          await redo(commandsRef);
        } else {
          await changeSelection(editorInput(renderer), 0, Math.min(4, currentMarkdown.length));
          await changeText(editorInput(renderer), `Head ${step}${currentMarkdown.slice(Math.min(4, currentMarkdown.length))}`);
          await runPendingTimers();
        }
        await expectStableEditingState(renderer, adapter);
      }

      expect(onError).not.toHaveBeenCalled();
    }
  });

  it("ignores stale selection drag events from retired rendered blocks", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });
    const staleRenderedNode = renderedMarkdownNodes(renderer, "Original")[0];

    await changeText(editorInput(renderer), "Original\nInserted");
    await act(async () => {
      staleRenderedNode?.props.onSelectionDragOutside({ direction: "down" });
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "Inserted",
        beforeMarkdown: "Original",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores stale hydration after an edit changes the document revision", async () => {
    const initialBlocks = [
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ];
    const adapter = new MountedEditorAdapter(snapshot(initialBlocks, 4), [
      ...initialBlocks,
      block("d1:b2", 2, "Third"),
      block("d1:b3", 3, "Fourth"),
    ]);
    const { onError, renderer } = await renderDocument({ adapter });
    await runPendingTimers();
    expect(adapter.pendingHydrationRequests).toHaveLength(1);

    await changeText(editorInput(renderer), "First\nInserted");
    adapter.pendingHydrationRequests[0]?.deferred.resolve([
      block("d1:b2", 2, "Stale third"),
      block("d1:b3", 3, "Stale fourth"),
    ]);
    await flushPromises();

    expect(renderedMarkdownNodes(renderer, "Stale third")).toEqual([]);
    expect(renderedMarkdownNodes(renderer, "Stale fourth")).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignores stale text-change events from a retired active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const { onError, renderer } = await renderDocument({ adapter });

    const firstInput = editorInput(renderer);
    const staleOnChangeText = firstInput.props.onChangeText;
    await act(async () => {
      staleOnChangeText("Original\nInserted");
    });
    await flushPromises();

    await act(async () => {
      staleOnChangeText("Original\nInserted from stale input");
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "Inserted",
        beforeMarkdown: "Original",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(onError).not.toHaveBeenCalled();
  });
});
