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
  private nextBlockNumber = 100;
  private revision = 0;

  constructor(
    private documentSnapshot: MarkdownDocumentSnapshot,
    private options: { metadataOnlySyncBlocks?: boolean } = {},
  ) {}

  get blockIds() {
    return this.blocks.map((candidate) => candidate.id);
  }

  get sourceMarkdown() {
    return this.blocks.map((candidate) => candidate.markdown).join("\n\n");
  }

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
    if (transaction.type === "replaceBlockRange") {
      const startIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.startBlockId);
      const endIndex = this.blocks.findIndex((candidate) => candidate.id === transaction.endBlockId);
      if (startIndex < 0 || endIndex < startIndex) {
        throw new Error(`Missing test block range: ${transaction.startBlockId} ${transaction.endBlockId}`);
      }

      const markdown = transaction.markdown ?? "";
      const nextHeadingLevel = headingLevelFromMarkdown(markdown);
      const nextBlock = {
        ...this.blocks[startIndex]!,
        contentEndByte: markdown.length,
        contentStartByte: 0,
        headingLevel: nextHeadingLevel,
        markdown,
        sourceEndByte: markdown.length,
        textRevision: this.blocks[startIndex]!.textRevision + 1,
        type: nextHeadingLevel > 0 ? "heading" : "paragraph",
      } satisfies MarkdownBlockSnapshot;
      const deleteCount = endIndex - startIndex + 1;
      const retiredBlockIds = this.blocks.slice(startIndex + 1, endIndex + 1).map((candidate) => candidate.id);
      this.blocks.splice(startIndex, deleteCount, nextBlock);
      this.blocks = this.blocks.map((candidate, index) => ({ ...candidate, index }));
      this.revision += 1;

      return {
        changedBlocks: [nextBlock],
        changedRange: {
          blockIds: [nextBlock.id],
          deleteCount,
          startBlockIndex: startIndex,
        },
        retiredBlockIds,
        revision: this.revision,
        sourceLength: markdown.length,
      };
    }

    if (transaction.type === "splitBlock") {
      const index = this.blocks.findIndex((candidate) => candidate.id === transaction.blockId);
      if (index < 0) {
        throw new Error(`Missing test block: ${transaction.blockId}`);
      }

      const originalBlock = this.blocks[index]!;
      const beforeHeadingLevel = headingLevelFromMarkdown(transaction.beforeMarkdown);
      const afterHeadingLevel = headingLevelFromMarkdown(transaction.afterMarkdown);
      const beforeBlock = {
        ...originalBlock,
        contentEndByte: transaction.beforeMarkdown.length,
        contentStartByte: 0,
        headingLevel: beforeHeadingLevel,
        markdown: transaction.beforeMarkdown,
        sourceEndByte: transaction.beforeMarkdown.length,
        textRevision: originalBlock.textRevision + 1,
        type: beforeHeadingLevel > 0 ? "heading" : "paragraph",
      } satisfies MarkdownBlockSnapshot;
      const afterBlock = {
        ...originalBlock,
        contentEndByte: transaction.afterMarkdown.length,
        contentStartByte: 0,
        headingLevel: afterHeadingLevel,
        id: this.nextBlockId(),
        index: index + 1,
        markdown: transaction.afterMarkdown,
        sourceEndByte: transaction.afterMarkdown.length,
        sourceStartByte: 0,
        textRevision: 0,
        type: afterHeadingLevel > 0 ? "heading" : "paragraph",
      } satisfies MarkdownBlockSnapshot;

      this.blocks.splice(index, 1, beforeBlock, afterBlock);
      this.blocks = this.blocks.map((candidate, nextIndex) => ({ ...candidate, index: nextIndex }));
      this.revision += 1;

      return {
        changedBlocks: [this.blocks[index]!, this.blocks[index + 1]!],
        changedRange: {
          blockIds: [beforeBlock.id, afterBlock.id],
          deleteCount: 1,
          startBlockIndex: index,
        },
        retiredBlockIds: [],
        revision: this.revision,
        sourceLength: this.blocks.reduce((total, blockSnapshot) => total + blockSnapshot.markdown.length, 0),
      };
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

  private nextBlockId() {
    const existingBlockIds = new Set(this.blocks.map((candidate) => candidate.id));
    let id = `d1:b${this.nextBlockNumber}`;
    while (existingBlockIds.has(id)) {
      this.nextBlockNumber += 1;
      id = `d1:b${this.nextBlockNumber}`;
    }
    this.nextBlockNumber += 1;
    return id;
  }
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

async function changeSelection(input: TestRenderer.ReactTestInstance, start: number, end = start) {
  await act(async () => {
    input.props.onChangeSelection({ end, start });
  });
  await Promise.resolve();
}

async function flushPromises(iterations = 20) {
  await act(async () => {
    for (let index = 0; index < iterations; index += 1) {
      await Promise.resolve();
    }
  });
}

function expectUniqueBlockIds(adapter: NativeOverlayAdapter) {
  expect(new Set(adapter.blockIds).size).toBe(adapter.blockIds.length);
}

async function expectStableKeyboardState(
  renderer: TestRenderer.ReactTestRenderer,
  adapter: NativeOverlayAdapter,
  onError: jest.Mock,
) {
  await Promise.resolve();
  expect(editorInput(renderer).props.defaultValue).toEqual(expect.any(String));
  expectUniqueBlockIds(adapter);
  expect(onError).not.toHaveBeenCalled();
}

class MarkdownKeyboardDriver {
  private selection = { end: 0, start: 0 };
  private value = "";

  constructor(
    private renderer: TestRenderer.ReactTestRenderer,
    private adapter: NativeOverlayAdapter,
    private onError: jest.Mock,
  ) {
    this.syncFromInput();
  }

  async setSelection(start: number, end = start) {
    this.selection = { end, start };
    await changeSelection(editorInput(this.renderer), start, end);
    await expectStableKeyboardState(this.renderer, this.adapter, this.onError);
  }

  async pressEnter() {
    const nextValue = this.replaceSelection("\n");
    const nextSelection = Math.min(this.selection.start, this.selection.end) + 1;
    await changeText(editorInput(this.renderer), nextValue);
    this.syncFromInput(nextValue, nextSelection);
    await expectStableKeyboardState(this.renderer, this.adapter, this.onError);
  }

  async typeText(text: string) {
    const nextValue = this.replaceSelection(text);
    const nextSelection = Math.min(this.selection.start, this.selection.end) + text.length;
    await changeText(editorInput(this.renderer), nextValue);
    this.syncFromInput(nextValue, nextSelection);
    await expectStableKeyboardState(this.renderer, this.adapter, this.onError);
  }

  private replaceSelection(text: string) {
    const selectionStart = Math.min(this.selection.start, this.selection.end);
    const selectionEnd = Math.max(this.selection.start, this.selection.end);
    return `${this.value.slice(0, selectionStart)}${text}${this.value.slice(selectionEnd)}`;
  }

  private syncFromInput(fallbackValue?: string, fallbackSelection?: number) {
    const inputValue = editorInput(this.renderer).props.defaultValue;
    this.value = typeof inputValue === "string" && inputValue !== this.value ? inputValue : fallbackValue ?? this.value;
    const nextSelection = Math.min(fallbackSelection ?? this.selection.start, this.value.length);
    this.selection = { end: nextSelection, start: nextSelection };
  }
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

describe("MarkdownDocument native row editor", () => {
  it("renders the editor inside the active row while the toolbar renders from the list footer", async () => {
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
          markdown: "First",
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
    expect(inputIndex).toBeLessThan(footerIndex);
    expect(activationView(renderer!, "d1:b0").findAllByProps({ testID: "markdown-editor-input" })).toContain(input);
    expect(flattenStyle(input.props.style)).toEqual(expect.objectContaining({
      position: "absolute",
      width: "100%",
    }));
    expect(flattenStyle(input.props.style)).toEqual(expect.not.objectContaining({
      height: 25,
      left: -10000,
      width: 640,
    }));
  });

  it("lets native pointer activation own the initial row editor selection", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "Paragraph"),
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
          height: 25,
          markdown: "Paragraph",
          rowHeight: 25,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const activeInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    expect(activeInput?.setSelection).not.toHaveBeenCalled();
  });

  it("keeps block ids unique when pressing enter and typing in the new native row editor block", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First"),
    ]));
    const onError = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          onError={onError}
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
          height: 25,
          markdown: "First",
          rowHeight: 25,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const keyboard = new MarkdownKeyboardDriver(renderer!, adapter, onError);
    await keyboard.setSelection("First".length);
    await keyboard.pressEnter();
    await keyboard.typeText("Second");

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: "",
        beforeMarkdown: "First",
        blockId: "d1:b0",
        type: "splitBlock",
      },
      {
        blockId: "d1:b100",
        markdown: "Second",
        type: "updateBlockMarkdown",
      },
    ]);
    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps enter-then-type stable when typing starts before the split transaction resolves", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First"),
    ]));
    let resolvePendingTransaction!: () => void;
    adapter.pendingTransactionGate = new Promise<void>((resolve) => {
      resolvePendingTransaction = resolve;
    });
    const onError = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          onError={onError}
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
          height: 25,
          markdown: "First",
          rowHeight: 25,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    const keyboard = new MarkdownKeyboardDriver(renderer!, adapter, onError);
    await keyboard.setSelection("First".length);
    await keyboard.pressEnter();
    await keyboard.typeText("Second");

    await act(async () => {
      resolvePendingTransaction();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(adapter.sourceMarkdown).toBe("First\n\nSecond");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps backspace-merge-then-type stable when typing starts before the merge resolves", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
    ]));
    let resolvePendingTransaction!: () => void;
    adapter.pendingTransactionGate = new Promise<void>((resolve) => {
      resolvePendingTransaction = resolve;
    });
    const onError = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          onError={onError}
          savePolicy={{ autosave: false }}
        />,
      );
      await Promise.resolve();
    });

    const host = nativeHost(renderer!);

    await act(async () => {
      host.props.onBeginEditing({
        nativeEvent: {
          blockId: "d1:b1",
          height: 25,
          markdown: "Second",
          rowHeight: 25,
          width: 640,
          x: 40,
          y: 105,
        },
      });
    });

    const keyboard = new MarkdownKeyboardDriver(renderer!, adapter, onError);
    await keyboard.setSelection(0);
    await act(async () => {
      host.props.onBackspaceAtStart({
        nativeEvent: {
          blockId: "d1:b1",
        },
      });
      await Promise.resolve();
    });
    await keyboard.typeText("!");

    await act(async () => {
      resolvePendingTransaction();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(adapter.sourceMarkdown).toBe("First!Second");
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("splits the active block from native enter without first inserting a newline", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First line"),
    ]));
    const onError = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <MarkdownDocument
          adapter={adapter}
          filename="test.md"
          onError={onError}
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
          height: 24,
          markdown: "First line",
          rowHeight: 43.2,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    await act(async () => {
      host.props.onEnterPressed({
        nativeEvent: {
          blockId: "d1:b0",
          selectionEnd: "First".length,
          selectionStart: "First".length,
        },
      });
    });
    await flushPromises();

    expect(adapter.applyTransactions).toEqual([
      {
        afterMarkdown: " line",
        beforeMarkdown: "First",
        blockId: "d1:b0",
        type: "splitBlock",
      },
    ]);
    expect(adapter.sourceMarkdown).toBe("First\n\n line");
    expect(nativeHost(renderer!).props.activeBlockId).toBe("d1:b100");
    expect(flattenStyle(activationView(renderer!, "d1:b100").props.style).minHeight).toBeCloseTo(62.4);
    expectUniqueBlockIds(adapter);
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps full heading markdown in the row editor while heading level changes", async () => {
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
          markdown: "### Heading",
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
      minHeight: 25,
      padding: 0,
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
    expect(activeInput?.setValue).toHaveBeenCalledWith("## Heading");
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
          markdown: "### Heading",
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
    expect(activeInput?.setValue).toHaveBeenCalledWith("## Heading");
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
          markdown: "# Heading",
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

  it("merges a non-heading block into the previous block on native backspace at the editable start", async () => {
    const adapter = new NativeOverlayAdapter(snapshot([
      block("d1:b0", 0, "First"),
      block("d1:b1", 1, "Second"),
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
          blockId: "d1:b1",
          height: 25,
          markdown: "Second",
          rowHeight: 25,
          width: 640,
          x: 40,
          y: 105,
        },
      });
    });

    const activeInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    activeInput?.setSelection.mockClear();
    activeInput?.setValue.mockClear();

    await act(async () => {
      host.props.onBackspaceAtStart({
        nativeEvent: {
          blockId: "d1:b1",
        },
      });
      await Promise.resolve();
    });

    const mergedInput = __enrichedMarkdownTestHooks.inputInstances().at(-1);
    expect(adapter.applyTransactions.at(-1)).toEqual({
      endBlockId: "d1:b1",
      markdown: "FirstSecond",
      startBlockId: "d1:b0",
      type: "replaceBlockRange",
    });
    expect(activeInput?.setValue).not.toHaveBeenCalled();
    expect(mergedInput?.setSelection).toHaveBeenCalledWith("First".length, "First".length);
  });

  it("uses native event markdown for row editor font metrics while the full block loads", async () => {
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
          markdown: "## Heading",
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({
      fontSize: 22,
    }));

    resolveGetBlock();
    await act(async () => {
      await Promise.resolve();
    });

    expect(flattenStyle(editorInput(renderer!).props.style)).toEqual(expect.objectContaining({
      fontSize: 22,
    }));
  });

  it("does not resize the list row while typed heading changes are still committing", async () => {
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
          markdown: "### Heading",
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.setItemSize.mockClear();
    await changeText(editorInput(renderer!), "### Heading text");

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
          markdown: "### Heading text",
          rowHeight: 54.2,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();

    resolveTransaction();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("lets the active row measure itself for text edits that do not change block presentation", async () => {
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
          markdown: "# Heading",
          rowHeight: 68,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    __legendListTestHooks.setItemSize.mockClear();
    await changeText(editorInput(renderer!), "# Heading text");

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 60,
          markdown: "# Heading text",
          rowHeight: 84,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 84,
    }));
  });

  it("sizes the active native row locally from the activation frame", async () => {
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
          markdown: "### Heading",
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 44,
    }));
    __legendListTestHooks.setItemSize.mockClear();

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 44,
          markdown: "### Heading",
          rowHeight: 60,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 60,
    }));

    await changeText(editorInput(renderer!), "### Heading changed");

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 46,
          markdown: "### Heading changed",
          rowHeight: 62,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 62,
    }));
  });

  it("uses native editor frame changes only for the active row min height", async () => {
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
          markdown: "### Heading",
          rowHeight: 44,
          width: 640,
          x: -10,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 44,
    }));

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 28,
          markdown: "### Heading",
          rowHeight: 44,
          width: 640,
          x: -10,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 44,
    }));

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 36,
          markdown: "### Heading",
          rowHeight: 52,
          width: 640,
          x: -10,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
    expect(flattenStyle(activationView(renderer!, "d1:b0").props.style)).toEqual(expect.objectContaining({
      minHeight: 52,
    }));

    await changeText(editorInput(renderer!), "### Heading changed");

    await act(async () => {
      nativeHost(renderer!).props.onEditorFrameChange({
        nativeEvent: {
          blockId: "d1:b0",
          height: 36,
          markdown: "### Heading changed",
          rowHeight: 52,
          width: 640,
          x: -10,
          y: 80,
        },
      });
    });

    expect(__legendListTestHooks.setItemSize).not.toHaveBeenCalled();
  });

  it("keeps rendered markdown mounted with the editor inside the active native row", async () => {
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
          markdown: "### Heading",
          rowHeight: 44,
          width: 640,
          x: 40,
          y: 80,
        },
      });
    });

    expect(activationView(renderer!, "d1:b0").findAllByType(EnrichedMarkdownText)).toHaveLength(1);
    expect(activationView(renderer!, "d1:b0").findAllByProps({ testID: "markdown-editor-input" }).length).toBeGreaterThan(0);
  });

});
