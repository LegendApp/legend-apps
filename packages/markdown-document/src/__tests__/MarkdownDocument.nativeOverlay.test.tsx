import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { MarkdownDocument } from "../MarkdownDocument";
import { defaultMarkdownStyle } from "../styles";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentCommands,
  MarkdownDocumentSnapshot,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "../types";

const { __legendListTestHooks } = jest.requireMock("@legendapp/list/react-native") as {
  __legendListTestHooks: {
    updateItemSize: jest.Mock;
  };
};

jest.mock("../constants", () => ({
  ...jest.requireActual("../constants"),
  usesNativeEditorOverlay: true,
}));

function block(id: string, index: number, markdown: string): MarkdownBlockSnapshot {
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

function headingBlock(id: string, index: number, markdown: string, headingLevel: MarkdownBlockSnapshot["headingLevel"]): MarkdownBlockSnapshot {
  return {
    ...block(id, index, markdown),
    headingLevel,
    type: "heading",
  };
}

function headingLevelFromMarkdown(markdown: string) {
  const match = /^(#{1,6})\s/.exec(markdown);
  return match ? match[1]!.length : 0;
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

class NativeOverlayAdapter implements MarkdownDocumentAdapter {
  applyTransactions: MarkdownTransaction[] = [];
  pendingTransactionGate: Promise<void> | undefined;
  private blocks: MarkdownBlockSnapshot[] = [];
  private revision = 0;

  constructor(private documentSnapshot: MarkdownDocumentSnapshot) {}

  async load() {
    this.blocks = [...this.documentSnapshot.initialBlocks];
    return this.documentSnapshot;
  }

  async getBlock(_documentId: string, blockId: string) {
    const blockSnapshot = this.blocks.find((candidate) => candidate.id === blockId);
    if (!blockSnapshot) {
      throw new Error(`Missing test block: ${blockId}`);
    }
    return blockSnapshot;
  }

  async getBlocks(_documentId: string, startIndex: number, count: number) {
    return this.blocks.slice(startIndex, startIndex + count);
  }

  async applyTransaction(_documentId: string, transaction: MarkdownTransaction): Promise<MarkdownTransactionResult> {
    this.applyTransactions.push(transaction);
    if (this.pendingTransactionGate) {
      await this.pendingTransactionGate;
      this.pendingTransactionGate = undefined;
    }
    if (transaction.type !== "updateBlockMarkdown") {
      throw new Error(`Unexpected native overlay transaction: ${transaction.type}`);
    }

    const index = this.blocks.findIndex((candidate) => candidate.id === transaction.blockId);
    if (index < 0) {
      throw new Error(`Missing test block: ${transaction.blockId}`);
    }

    this.revision += 1;
    const nextHeadingLevel = headingLevelFromMarkdown(transaction.markdown);
    const nextBlock = {
      ...this.blocks[index]!,
      contentEndByte: transaction.markdown.length,
      contentStartByte: 0,
      headingLevel: nextHeadingLevel,
      markdown: transaction.markdown,
      sourceEndByte: transaction.markdown.length,
      textRevision: this.blocks[index]!.textRevision + 1,
      type: nextHeadingLevel > 0 ? "heading" : "paragraph",
    } satisfies MarkdownBlockSnapshot;
    this.blocks[index] = nextBlock;

    return {
      changedBlocks: [nextBlock],
      changedRange: {
        blockIds: [nextBlock.id],
        deleteCount: 1,
        startBlockIndex: index,
      },
      retiredBlockIds: [],
      revision: this.revision,
      sourceLength: transaction.markdown.length,
    };
  }

  async save() {}

  async saveAs() {}

  async close() {}
}

function renderedNodeIndex(renderer: TestRenderer.ReactTestRenderer, predicate: (node: TestRenderer.ReactTestInstance) => boolean) {
  return renderer.root.findAll(() => true).findIndex(predicate);
}

function editorInput(root: TestRenderer.ReactTestRenderer | TestRenderer.ReactTestInstance) {
  const testRoot = "root" in root ? root.root : root;
  const input = testRoot.findAllByProps({ testID: "markdown-editor-input" })[0];
  if (!input) {
    throw new Error("Missing markdown editor input");
  }
  return input;
}

function nativeHost(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.find((node) => (
    typeof node.props.onBeginEditing === "function" &&
    typeof node.props.onEditorFrameChange === "function" &&
    Object.prototype.hasOwnProperty.call(node.props, "activeMarkdown")
  ));
}

function activationView(renderer: TestRenderer.ReactTestRenderer, blockId: string) {
  return renderer.root.find((node) => node.props.blockId === blockId);
}

async function changeText(input: TestRenderer.ReactTestInstance, markdown: string) {
  await act(async () => {
    input.props.onChangeText(markdown);
  });
  await Promise.resolve();
}

function flattenStyle(style: unknown) {
  const flattened: Record<string, unknown> = {};

  const appendStyle = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(appendStyle);
    } else if (value && typeof value === "object") {
      const styleObject = value as Record<string, unknown>;
      Object.keys(styleObject)
        .filter((key) => /^\d+$/.test(key))
        .sort((left, right) => Number(left) - Number(right))
        .forEach((key) => appendStyle(styleObject[key]));

      Object.keys(styleObject)
        .filter((key) => !/^\d+$/.test(key))
        .forEach((key) => {
          flattened[key] = styleObject[key];
        });
    }
  };

  appendStyle(style);
  return flattened;
}

describe("MarkdownDocument native editor overlay", () => {
  it("keeps the editor as a host overlay while the toolbar renders from the list footer", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    const selectionToolbarAnchor = {
      blockId: "d1:b0",
      height: 25,
      itemHeight: 25,
      itemWidth: 640,
      itemX: 40,
      itemY: 80,
      kind: "textSelection" as const,
      width: 120,
      x: 40,
      y: 80,
    };
    const renderSelectionToolbar = jest.fn(() => (
      <View testID="markdown-selection-toolbar" />
    ));
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          renderSelectionToolbar={renderSelectionToolbar}
          savePolicy={{ autosave: false }}
          selectionToolbarAnchor={selectionToolbarAnchor}
        />,
      );
      await Promise.resolve();
    });

    const host = nativeHost(renderer!);
    const list = renderer!.root.find((node) => typeof node.props.onScroll === "function");

    await act(async () => {
      list.props.onScroll({ nativeEvent: { contentOffset: { y: 120 }, layoutMeasurement: { height: 400 } } });
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 25,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const footer = renderer!.root.findByProps({ testID: "legend-list-footer" });
    const input = editorInput(renderer!);
    const footerIndex = renderedNodeIndex(renderer!, (node) => node.props.testID === "legend-list-footer");
    const inputIndex = renderedNodeIndex(renderer!, (node) => node === input);

    expect(footer.findAllByProps({ testID: "markdown-editor-input" })).toHaveLength(0);
    expect(footer.findAll((node) => (
      String(node.type) === "View" && node.props.testID === "markdown-selection-toolbar"
    ))).toHaveLength(1);
    expect(inputIndex).toBeGreaterThan(footerIndex);
    expect(flattenStyle(input.props.style)).toEqual(expect.objectContaining({
      left: -10000,
      position: "absolute",
      top: -10000,
      width: expect.any(Number),
    }));
    expect(flattenStyle(input.props.style)).toEqual(expect.not.objectContaining({
      height: 25,
      width: 640,
    }));
  });

  it("updates the overlay editor style when heading level changes", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      headingBlock("d1:b0", 0, "### Heading", 3),
    ]));
    const commandsRef = React.createRef<MarkdownDocumentCommands>();
    const markdownStyle = {
      ...defaultMarkdownStyle,
      h2: { ...defaultMarkdownStyle.h2, fontSize: 22 },
      h3: { ...defaultMarkdownStyle.h3, fontSize: 18 },
      paragraph: { ...defaultMarkdownStyle.paragraph, fontSize: 12 },
    };
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          ref={commandsRef}
          adapter={adapter}
          filename="test.md"
          markdownStyle={markdownStyle}
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    const host = nativeHost(renderer!);

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({ fontSize: 18 }));

    await act(async () => {
      commandsRef.current?.setHeading(2);
      await Promise.resolve();
    });

    expect(host.props.activeBlockId).toBe("d1:b0");
    expect(host.props.activeMarkdown).toBe("## Heading");
    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({ fontSize: 22 }));
  });

  it("updates native host markdown optimistically while typed heading changes are still committing", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      headingBlock("d1:b0", 0, "### Heading", 3),
    ]));
    let resolveTransaction!: () => void;
    adapter.pendingTransactionGate = new Promise<void>((resolve) => {
      resolveTransaction = resolve;
    });
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    const host = nativeHost(renderer!);

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.updateItemSize.mockClear();
    await changeText(editorInput(renderer!), "## Heading");

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "## Heading",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(nativeHost(renderer!).props.activeMarkdown).toBe("## Heading");
    expect(__legendListTestHooks.updateItemSize).not.toHaveBeenCalled();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 35,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.updateItemSize).toHaveBeenCalledWith("d1:b0", {
      height: 54.2,
      width: 640,
    });

    resolveTransaction();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("keeps the measured native row size for text edits that do not change block presentation", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      headingBlock("d1:b0", 0, "# Heading", 1),
    ]));
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    const host = nativeHost(renderer!);

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.updateItemSize.mockClear();
    await changeText(editorInput(renderer!), "# Heading text");

    expect(nativeHost(renderer!).props.activeMarkdown).toBe("# Heading text");
    expect(__legendListTestHooks.updateItemSize).not.toHaveBeenCalled();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 60,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.updateItemSize).toHaveBeenCalledWith("d1:b0", {
      height: 84,
      width: 640,
    });
    expect(activationView(renderer!, "d1:b0").props.style).toEqual(
      expect.arrayContaining([
        { height: 60 },
      ]),
    );
  });

  it("sizes the active native row from the native editor frame", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      headingBlock("d1:b0", 0, "### Heading", 3),
    ]));
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    await act(async () => {
      nativeHost(renderer!).props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({ height: 28 }));

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({ height: 44 }));
  });

  it("keeps rendered markdown mounted inside the active native row", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      headingBlock("d1:b0", 0, "### Heading", 3),
    ]));
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    expect(activationView(renderer!, "d1:b0").findAllByType(EnrichedMarkdownText)).toHaveLength(1);

    await act(async () => {
      nativeHost(renderer!).props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(activationView(renderer!, "d1:b0").findAllByType(EnrichedMarkdownText)).toHaveLength(1);
  });

});
