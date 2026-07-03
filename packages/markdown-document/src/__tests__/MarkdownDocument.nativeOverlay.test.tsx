import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { MarkdownDocument } from "../MarkdownDocument";
import { defaultMarkdownStyle } from "../styles";
import type {
  MarkdownBlockMetadata,
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentCommands,
  MarkdownDocumentSnapshot,
  MarkdownTransaction,
  MarkdownTransactionResult,
} from "../types";

const { __legendListTestHooks } = jest.requireMock("@legendapp/list/react-native") as {
  __legendListTestHooks: {
    setItemSize: jest.Mock;
  };
};
const { __enrichedMarkdownTestHooks } = jest.requireMock("react-native-enriched-markdown") as {
  __enrichedMarkdownTestHooks: {
    inputInstances: () => Array<{
      setSelection: jest.Mock;
      setValue: jest.Mock;
    }>;
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

function metadataOnly(block: MarkdownBlockSnapshot): MarkdownBlockMetadata {
  const { markdown: _markdown, ...metadata } = block;
  return metadata;
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
  pendingGetBlockGate: Promise<void> | undefined;
  pendingTransactionGate: Promise<void> | undefined;
  private blocks: MarkdownBlockSnapshot[] = [];
  private revision = 0;

  constructor(
    private documentSnapshot: MarkdownDocumentSnapshot,
    private options: { metadataOnlySyncBlocks?: boolean } = {},
  ) {}

  async load() {
    this.blocks = [...this.documentSnapshot.initialBlocks] as MarkdownBlockSnapshot[];
    return this.documentSnapshot;
  }

  async getBlock(_documentId: string, blockId: string) {
    if (this.pendingGetBlockGate) {
      await this.pendingGetBlockGate;
      this.pendingGetBlockGate = undefined;
    }

    const blockSnapshot = this.blocks.find((candidate) => candidate.id === blockId);
    if (!blockSnapshot) {
      throw new Error(`Missing test block: ${blockId}`);
    }
    return blockSnapshot;
  }

  getBlockAtIndexSync(_documentId: string, index: number) {
    const blockSnapshot = this.blocks[index];
    return this.options.metadataOnlySyncBlocks && blockSnapshot ? metadataOnly(blockSnapshot) : blockSnapshot;
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
    typeof node.props.onEditorFrameChange === "function"
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

function headingMarkerText(renderer: TestRenderer.ReactTestRenderer) {
  const marker = renderer.root.findByProps({ testID: "markdown-heading-edit-marker" });
  return marker
    .findAllByType(Text)
    .map((node) => node.props.children)
    .filter((child) => typeof child === "string" || typeof child === "number")
    .map(String);
}

function headingMarkerStyle(renderer: TestRenderer.ReactTestRenderer) {
  return flattenStyle(renderer.root.findByProps({ testID: "markdown-heading-edit-marker" }).props.style);
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

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 25,
          rowHeight: 25,
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
    }));
    expect(flattenStyle(input.props.style)).toEqual(expect.not.objectContaining({
      height: 25,
      width: 640,
    }));
  });

  it("keeps heading syntax out of the overlay editor while heading level changes", async () => {
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
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const initialOverlayStyle = flattenStyle(editorInput(renderer!).props.style);
    expect(initialOverlayStyle).toEqual(expect.objectContaining({
      fontSize: 18,
      left: -10000,
      minHeight: 25,
      padding: 0,
      position: "absolute",
      top: -10000,
      width: "100%",
    }));
    expect(headingMarkerText(renderer!)).toEqual(["H", "3"]);

    const activeInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    activeInput?.setValue.mockClear();

    await act(async () => {
      commandsRef.current?.setHeading(2);
      await Promise.resolve();
    });

    expect(host.props.activeBlockId).toBe("d1:b0");
    expect(host.props.activeBlockMarkdown).toBe("## Heading");
    expect(activeInput?.setValue).toHaveBeenCalledWith("Heading");
    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({
      fontSize: 22,
    }));
    expect(headingMarkerText(renderer!)).toEqual(["H", "2"]);
  });

  it("reduces heading level on native backspace at the editable start", async () => {
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

    const host = nativeHost(renderer!);

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const activeInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    activeInput?.setValue.mockClear();

    await act(async () => {
      host.props.onBackspaceAtStart({
        nativeEvent: {
          blockId: "d1:b0",
        },
      });
      await Promise.resolve();
    });

    expect(adapter.applyTransactions.at(-1)).toEqual({
      blockId: "d1:b0",
      markdown: "## Heading",
      type: "updateBlockMarkdown",
    });
    expect(activeInput?.setValue).toHaveBeenCalledWith("Heading");
    expect(headingMarkerText(renderer!)).toEqual(["H", "2"]);
  });

  it("converts an h1 to a paragraph on native backspace at the editable start", async () => {
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
          height: 28,
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const activeInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    activeInput?.setValue.mockClear();

    await act(async () => {
      host.props.onBackspaceAtStart({
        nativeEvent: {
          blockId: "d1:b0",
        },
      });
      await Promise.resolve();
    });

    expect(adapter.applyTransactions.at(-1)).toEqual({
      blockId: "d1:b0",
      markdown: "Heading",
      type: "updateBlockMarkdown",
    });
    expect(activeInput?.setValue).toHaveBeenCalledWith("Heading");
    expect(headingMarkerStyle(renderer!)).toEqual(expect.objectContaining({
      opacity: 0,
    }));
  });

  it("waits for the full heading block before deriving overlay editor font metrics", async () => {
    const adapter = new NativeOverlayAdapter(
      snapshot([
        headingBlock("d1:b0", 0, "## Heading", 2),
      ]),
      { metadataOnlySyncBlocks: true },
    );
    let resolveGetBlock!: () => void;
    adapter.pendingGetBlockGate = new Promise<void>((resolve) => {
      resolveGetBlock = resolve;
    });
    const markdownStyle = {
      ...defaultMarkdownStyle,
      h2: { ...defaultMarkdownStyle.h2, fontSize: 22 },
      paragraph: { ...defaultMarkdownStyle.paragraph, fontSize: 12 },
    };
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          markdownStyle={markdownStyle}
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
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const pendingOverlayStyle = flattenStyle(editorInput(renderer!).props.style);
    expect(pendingOverlayStyle).toEqual(expect.not.objectContaining({
      fontSize: expect.any(Number),
      lineHeight: expect.any(Number),
    }));

    resolveGetBlock();
    await act(async () => {
      await Promise.resolve();
    });

    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({
      fontSize: 22,
    }));
  });

  it("keeps measured row size while typed heading changes are still committing", async () => {
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
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.setItemSize.mockClear();
    await changeText(editorInput(renderer!), "Heading text");

    expect(adapter.applyTransactions).toEqual([
      {
        blockId: "d1:b0",
        markdown: "### Heading text",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 35,
          rowHeight: 54.2,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).toHaveBeenCalledWith("d1:b0", {
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
          rowHeight: 68,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.setItemSize.mockClear();
    await changeText(editorInput(renderer!), "Heading text");

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 60,
          rowHeight: 84,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).toHaveBeenCalledWith("d1:b0", {
      height: 84,
      width: 640,
    });
    expect(activationView(renderer!, "d1:b0").props.style).toEqual(
      expect.arrayContaining([
        { height: 84 },
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
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({ height: 44 }));

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 44,
          rowHeight: 60,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({ height: 60 }));
  });

  it("keeps the native row width stable when the editor frame has a negative x offset", async () => {
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

    __legendListTestHooks.setItemSize.mockClear();
    await act(async () => {
      nativeHost(renderer!).props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          rowHeight: 44,
          width: 640,
          x: -10,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).toHaveBeenLastCalledWith("d1:b0", expect.objectContaining({
      width: 640,
    }));
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
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(activationView(renderer!, "d1:b0").findAllByType(EnrichedMarkdownText)).toHaveLength(1);
  });

});
