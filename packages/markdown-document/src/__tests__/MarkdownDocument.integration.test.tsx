import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MarkdownDocument } from "../MarkdownDocument";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentCommands,
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
  return transaction.type === "replaceBlockRange" ? transaction.startBlockId : transaction.blockId;
}

class MountedEditorAdapter implements MarkdownDocumentAdapter {
  applyTransactions: MarkdownTransaction[] = [];
  closeCount = 0;
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

  get markdownById() {
    return new Map(this.blocks.map((candidate) => [candidate.id, candidate.markdown]));
  }

  get sourceMarkdown() {
    return this.blocks.map((candidate) => candidate.markdown).join("\n\n");
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
    this.saveRevisions.push(this.revision);
  }

  async saveAs() {
    this.saveCount += 1;
    this.saveRevisions.push(this.revision);
  }

  async close() {
    this.closeCount += 1;
  }

  async applyTransaction(_documentId: string, transaction: MarkdownTransaction) {
    this.applyTransactions.push(transaction);
    const index = this.blocks.findIndex((candidate) => candidate.id === transactionBlockId(transaction));
    if (index < 0) {
      throw new Error(`Markdown block not found: ${transactionBlockId(transaction)}`);
    }

    if (transaction.type === "replaceBlockRange") {
      return this.applyReplaceBlockRange(index, transaction);
    }

    if (transaction.type === "splitBlock") {
      return this.applySplitBlock(index, transaction.beforeMarkdown, transaction.afterMarkdown);
    }

    return this.applyUpdateBlockMarkdown(index, transaction.markdown);
  }

  private nextBlockId() {
    const id = `d1:b${this.nextBlockNumber}`;
    this.nextBlockNumber += 1;
    return id;
  }

  private normalizeBlocks(blocks: MarkdownBlockSnapshot[]) {
    return blocks.map((candidate, index) => ({
      ...candidate,
      contentEndByte: candidate.markdown.length,
      contentStartByte: 0,
      index,
      sourceEndByte: candidate.markdown.length,
      sourceStartByte: 0,
    }));
  }

  private blocksFromMarkdown(markdown: string, startIndex: number, firstBlockId?: string) {
    if (markdown.length === 0) {
      return [];
    }

    return markdown.split(/\n\n/).map((part, offset) => block(
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
    const normalizedChangedBlocks = this.normalizeBlocks(changedBlocks);
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
      block(this.nextBlockId(), index, beforeMarkdown),
      block(this.nextBlockId(), index + 1, afterMarkdown),
    ];
    return this.commitChangedRange(index, 1, changedBlocks, [originalBlock.id]);
  }

  private applyUpdateBlockMarkdown(index: number, markdown: string) {
    const originalBlock = this.blocks[index]!;
    const changedBlocks = this.blocksFromMarkdown(markdown, index, originalBlock.id);
    return this.commitChangedRange(index, 1, changedBlocks, changedBlocks.length > 0 ? [] : [originalBlock.id]);
  }

  private applyReplaceBlockRange(index: number, transaction: Extract<MarkdownTransaction, { type: "replaceBlockRange" }>) {
    const endIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.endBlockId);
    if (endIndex < index) {
      throw new Error(`Markdown block not found: ${transaction.endBlockId}`);
    }

    const deleteCount = endIndex - index + 1;
    const retiredBlockIds = this.blocks.slice(index, index + deleteCount).map((candidate) => candidate.id);
    const changedBlocks = this.blocksFromMarkdown(transaction.markdown ?? "", index);
    return this.commitChangedRange(index, deleteCount, changedBlocks, retiredBlockIds);
  }
}

async function renderDocument({
  adapter,
  autoFocusFirstBlock = true,
  onCommandStateChange = jest.fn(),
  onDirtyChange = jest.fn(),
  onError = jest.fn(),
}: {
  adapter: MountedEditorAdapter;
  autoFocusFirstBlock?: boolean;
  onCommandStateChange?: jest.Mock;
  onDirtyChange?: jest.Mock;
  onError?: jest.Mock;
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
        savePolicy={{ autosave: false }}
      />,
    );
    await Promise.resolve();
  });

  return {
    commandsRef,
    onCommandStateChange,
    onDirtyChange,
    onError,
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

async function changeText(input: TestRenderer.ReactTestInstance, markdown: string) {
  await act(async () => {
    input.props.onChangeText(markdown);
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
    expect(adapter.blockIds).toEqual(["d1:b100", "d1:b101"]);
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
