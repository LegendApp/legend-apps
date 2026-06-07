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

function snapshot(initialBlocks: MarkdownBlockSnapshot[]): MarkdownDocumentSnapshot {
  return {
    blockCount: initialBlocks.length,
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

function transactionResult({
  blockIds,
  changedBlocks,
  deleteCount,
  retiredBlockIds = [],
  revision,
  startBlockIndex,
}: {
  blockIds: string[];
  changedBlocks: MarkdownBlockSnapshot[];
  deleteCount: number;
  retiredBlockIds?: string[];
  revision: number;
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
    sourceLength: 100,
  };
}

function flushPromises() {
  return act(async () => {
    await Promise.resolve();
  });
}

class MountedEditorAdapter implements MarkdownDocumentAdapter {
  applyTransactions: MarkdownTransaction[] = [];

  constructor(private documentSnapshot: MarkdownDocumentSnapshot) {}

  async load() {
    return this.documentSnapshot;
  }

  async getBlock(_documentId: string, blockId: string) {
    const blockSnapshot = this.documentSnapshot.initialBlocks.find((candidate) => candidate.id === blockId);
    if (!blockSnapshot) {
      throw new Error(`Missing test block: ${blockId}`);
    }
    return blockSnapshot;
  }

  async getBlocks(_documentId: string, startIndex: number, count: number) {
    return this.documentSnapshot.initialBlocks.slice(startIndex, startIndex + count);
  }

  async save() {}

  async saveAs() {}

  async close() {}

  async applyTransaction(_documentId: string, transaction: MarkdownTransaction) {
    this.applyTransactions.push(transaction);
    if (transaction.type === "splitBlock" && transaction.blockId === "d1:b0") {
      return transactionResult({
        blockIds: ["d1:b2", "d1:b3"],
        changedBlocks: [
          block("d1:b2", 0, transaction.beforeMarkdown),
          block("d1:b3", 1, transaction.afterMarkdown),
        ],
        deleteCount: 1,
        retiredBlockIds: ["d1:b0"],
        revision: 1,
        startBlockIndex: 0,
      });
    }

    if (transaction.type === "splitBlock" && transaction.blockId === "d1:b2") {
      return transactionResult({
        blockIds: ["d1:b2", "d1:b4"],
        changedBlocks: [
          block("d1:b2", 0, transaction.beforeMarkdown),
          block("d1:b4", 1, transaction.afterMarkdown),
        ],
        deleteCount: 1,
        revision: 2,
        startBlockIndex: 0,
      });
    }

    throw new Error(`Markdown block not found: ${transaction.type === "replaceBlockRange" ? transaction.startBlockId : transaction.blockId}`);
  }
}

describe("MarkdownDocument mounted editing", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
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
  });

  it("ignores stale text-change events from a retired active block", async () => {
    const adapter = new MountedEditorAdapter(snapshot([block("d1:b0", 0, "Original")]));
    const onError = jest.fn();
    const commandsRef = React.createRef<MarkdownDocumentCommands>();

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          autoFocusFirstBlock
          commandsRef={commandsRef}
          filename="test.md"
          onError={onError}
          savePolicy={{ autosave: false }}
        />,
      );
    });
    await flushPromises();

    const firstInput = renderer!.root.findByProps({ testID: "markdown-editor-input" });
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
