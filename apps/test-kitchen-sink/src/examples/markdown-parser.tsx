import { openFileDialog } from "@legend-apps/file-dialog";
import {
  loadMarkdownFile,
  type MarkdownDocument,
  type MarkdownDocumentTiming,
  type MarkdownRenderBlock,
  type MarkdownTransactionResult,
} from "@legend-apps/markdown-parser";
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useEffect, useRef, useState } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownStyle,
  type MarkdownTextInputStyle,
} from "react-native-enriched-markdown";
import { type GestureResponderEvent, Linking, Pressable, Text, View } from "react-native";
import { ExampleButton, styles } from "./shared";

const MARKDOWN_INITIAL_BLOCK_COUNT = 64;
const MARKDOWN_CACHE_HYDRATE_CHUNK_SIZE = 512;

const markdownViewerStyle: MarkdownStyle = {
  blockquote: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
    borderWidth: 3,
    color: "#1e3a8a",
    fontSize: 14,
    lineHeight: 21,
  },
  code: {
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontFamily: "Menlo",
    fontSize: 13,
  },
  codeBlock: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 6,
    borderWidth: 1,
    color: "#e2e8f0",
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  h1: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    marginBottom: 4,
  },
  h2: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 4,
  },
  link: {
    color: "#2563eb",
    underline: true,
  },
  list: {
    color: "#334155",
    fontSize: 14,
    gapWidth: 8,
    lineHeight: 21,
    markerColor: "#475569",
  },
  paragraph: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
  },
  table: {
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 6,
    color: "#334155",
    fontSize: 13,
    headerBackgroundColor: "#e2e8f0",
    headerTextColor: "#0f172a",
    rowEvenBackgroundColor: "#ffffff",
    rowOddBackgroundColor: "#f8fafc",
  },
  taskList: {
    borderColor: "#64748b",
    checkedColor: "#2563eb",
    checkedTextColor: "#64748b",
  },
};

const markdownEditorStyle: MarkdownTextInputStyle = {
  em: {
    color: "#334155",
  },
  link: {
    color: "#2563eb",
    underline: true,
  },
  strong: {
    color: "#0f172a",
  },
};

function formatDuration(durationMs: number) {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

function formatPreciseDuration(durationMs: number) {
  return durationMs < 1000 ? `${durationMs.toFixed(2)}ms` : `${(durationMs / 1000).toFixed(3)}s`;
}

function formatTiming(timing: MarkdownDocumentTiming) {
  const nativeMs = timing.readMs + timing.parseMs + timing.documentMs;
  return `${formatPreciseDuration(nativeMs)} native (${formatPreciseDuration(timing.readMs)} read, ${formatPreciseDuration(
    timing.parseMs,
  )} parse, ${formatPreciseDuration(timing.documentMs)} document)`;
}

function markdownDocumentIndices(document: MarkdownDocument) {
  return Array.from({ length: document.blockCount }, (_, index) => index);
}

function cacheMarkdownDocumentBlocks(
  document: MarkdownDocument,
  cache: Map<number, MarkdownRenderBlock>,
  start: number,
  count: number,
) {
  for (const block of document.getRenderBlocks(start, count)) {
    cache.set(block.index, block);
  }
}

function getCachedMarkdownBlock(document: MarkdownDocument, index: number, cache: Map<number, MarkdownRenderBlock>) {
  const cached = cache.get(index);
  if (cached) {
    return cached;
  }

  const block = document.getRenderBlocks(index, 1)[0];
  if (block) {
    cache.set(index, block);
  }
  return block;
}

function estimateMarkdownSelection(markdown: string, event: GestureResponderEvent, width: number) {
  const lineHeight = 21;
  const averageCharacterWidth = 7.2;
  const x = Math.max(0, event.nativeEvent.locationX);
  const y = Math.max(0, event.nativeEvent.locationY);
  const visualLine = Math.floor(y / lineHeight);
  const characterInVisualLine = Math.floor(x / averageCharacterWidth);
  const charactersPerLine = Math.max(20, Math.floor(width / averageCharacterWidth));
  const lines = markdown.split("\n");
  let offset = 0;
  let currentVisualLine = 0;

  for (const line of lines) {
    const wrappedLineCount = Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine));
    if (visualLine < currentVisualLine + wrappedLineCount) {
      const wrappedLine = visualLine - currentVisualLine;
      return Math.min(
        markdown.length,
        offset + Math.min(line.length, wrappedLine * charactersPerLine + characterInVisualLine),
      );
    }
    offset += line.length + 1;
    currentVisualLine += wrappedLineCount;
  }

  return markdown.length;
}

function estimateMarkdownEditorHeight(markdown: string, width: number) {
  const lineHeight = 21;
  const averageCharacterWidth = 7.2;
  const charactersPerLine = Math.max(20, Math.floor(width / averageCharacterWidth));
  const visualLines = markdown
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine)), 0);

  return Math.max(28, visualLines * lineHeight + 8);
}

function MarkdownBlockEditor({
  block,
  initialSelection,
  onCommitMarkdown,
  onFinishEditing,
  width,
}: {
  block: MarkdownRenderBlock;
  initialSelection: number;
  onCommitMarkdown: (block: MarkdownRenderBlock, markdown: string) => void;
  onFinishEditing: (block: MarkdownRenderBlock) => void;
  width: number;
}) {
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const didPlaceCursorRef = useRef(false);
  const draftMarkdownRef = useRef(block.markdown);
  const [draftMarkdown, setDraftMarkdown] = useState(block.markdown);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!didPlaceCursorRef.current) {
        didPlaceCursorRef.current = true;
        inputRef.current?.focus();
        inputRef.current?.setSelection(initialSelection, initialSelection);
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [initialSelection]);

  return (
    <EnrichedMarkdownTextInput
      ref={inputRef}
      autoFocus
      cursorColor="#2563eb"
      defaultValue={block.markdown}
      markdownStyle={markdownEditorStyle}
      onBlur={() => {
        const input = inputRef.current;
        if (!input) {
          onCommitMarkdown(block, draftMarkdownRef.current);
          onFinishEditing(block);
          return;
        }

        void input
          .getMarkdown()
          .then((markdown) => {
            onCommitMarkdown(block, markdown);
          })
          .catch(() => {
            onCommitMarkdown(block, draftMarkdownRef.current);
          })
          .finally(() => {
            onFinishEditing(block);
          });
      }}
      onChangeMarkdown={(markdown) => {
        draftMarkdownRef.current = markdown;
        setDraftMarkdown(markdown);
      }}
      selectionColor="#bfdbfe"
      style={{ ...styles.markdownEditorInput, minHeight: estimateMarkdownEditorHeight(draftMarkdown, width) }}
    />
  );
}

function MarkdownBlockRow({
  blockCache,
  document,
  editingBlockId,
  editingSelection,
  item,
  onCommitMarkdown,
  onFinishEditing,
  onStartEditing,
}: LegendListRenderItemProps<number> & {
  blockCache: Map<number, MarkdownRenderBlock>;
  document?: MarkdownDocument;
  editingBlockId?: string;
  editingSelection: number;
  onCommitMarkdown: (block: MarkdownRenderBlock, markdown: string) => void;
  onFinishEditing: (block: MarkdownRenderBlock) => void;
  onStartEditing: (block: MarkdownRenderBlock, selection: number) => void;
}) {
  const [rowWidth, setRowWidth] = useState(700);
  const block = document ? getCachedMarkdownBlock(document, item, blockCache) : undefined;
  const isEditing = block?.id === editingBlockId;

  if (!block) {
    return null;
  }

  return (
    <Pressable
      onLayout={(event) => {
        setRowWidth(event.nativeEvent.layout.width);
      }}
      onPress={(event) => {
        if (!isEditing) {
          onStartEditing(block, estimateMarkdownSelection(block.markdown, event, rowWidth));
        }
      }}
      style={styles.markdownBlockRow}
    >
      {isEditing ? (
        <MarkdownBlockEditor
          block={block}
          initialSelection={editingSelection}
          onCommitMarkdown={onCommitMarkdown}
          onFinishEditing={onFinishEditing}
          width={rowWidth}
        />
      ) : (
        <EnrichedMarkdownText
          allowTrailingMargin={false}
          containerStyle={styles.markdownRenderedText}
          flavor="github"
          markdown={block.markdown}
          markdownStyle={markdownViewerStyle}
          onLinkPress={(event) => {
            void Linking.openURL(event.url);
          }}
          selectable
        />
      )}
    </Pressable>
  );
}

export function MarkdownParserExample() {
  const blockCacheRef = useRef(new Map<number, MarkdownRenderBlock>());
  const documentVersionRef = useRef(0);
  const hydrateFrameRef = useRef<number | undefined>(undefined);
  const [blockIndices, setBlockIndices] = useState<number[]>([]);
  const [document, setDocument] = useState<MarkdownDocument | undefined>();
  const [documentKey, setDocumentKey] = useState("initial");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [editingBlockId, setEditingBlockId] = useState<string | undefined>();
  const [editingSelection, setEditingSelection] = useState(0);
  const [status, setStatus] = useState("Choose a markdown file to load.");

  const cancelBlockCacheHydration = () => {
    if (hydrateFrameRef.current !== undefined) {
      cancelAnimationFrame(hydrateFrameRef.current);
      hydrateFrameRef.current = undefined;
    }
  };

  const hydrateRemainingBlocks = (nextDocument: MarkdownDocument, version: number) => {
    cancelBlockCacheHydration();

    let start = Math.min(MARKDOWN_INITIAL_BLOCK_COUNT, nextDocument.blockCount);
    const hydrateChunk = () => {
      hydrateFrameRef.current = undefined;
      if (version !== documentVersionRef.current || start >= nextDocument.blockCount) {
        return;
      }

      const count = Math.min(MARKDOWN_CACHE_HYDRATE_CHUNK_SIZE, nextDocument.blockCount - start);
      cacheMarkdownDocumentBlocks(nextDocument, blockCacheRef.current, start, count);
      start += count;

      if (version === documentVersionRef.current && start < nextDocument.blockCount) {
        hydrateFrameRef.current = requestAnimationFrame(hydrateChunk);
      }
    };

    if (start < nextDocument.blockCount) {
      hydrateFrameRef.current = requestAnimationFrame(hydrateChunk);
    }
  };

  const replaceDocument = (
    nextDocument: MarkdownDocument,
    source: string,
    initialBlocks: readonly MarkdownRenderBlock[],
  ) => {
    cancelBlockCacheHydration();
    documentVersionRef.current += 1;
    blockCacheRef.current.clear();
    for (const block of initialBlocks) {
      blockCacheRef.current.set(block.index, block);
    }
    setDocument(nextDocument);
    setDocumentKey(`${source}:${nextDocument.sourceSize}:${nextDocument.blockCount}:${documentVersionRef.current}`);
    setDocumentRevision(0);
    setBlockIndices(markdownDocumentIndices(nextDocument));
    setEditingBlockId(undefined);
    setEditingSelection(0);
  };

  const applyDocumentTransactionResult = (result: MarkdownTransactionResult) => {
    const startIndex = result.changedRange.startBlockIndex;
    const deleteCount = result.changedRange.deleteCount;
    const changedBlocks = result.changedBlocks;

    for (const block of changedBlocks) {
      blockCacheRef.current.set(block.index, block);
    }

    setBlockIndices((currentIndices) => [
      ...currentIndices.slice(0, startIndex),
      ...changedBlocks.map((block) => block.index),
      ...currentIndices
        .slice(startIndex + deleteCount)
        .map((_, offset) => startIndex + changedBlocks.length + offset),
    ]);
    setDocumentRevision(result.revision);
  };

  const commitBlockMarkdown = (block: MarkdownRenderBlock, markdown: string) => {
    if (!document || markdown === block.markdown) {
      return;
    }

    try {
      const result = document.applyTransaction({
        blockId: block.id,
        markdown,
        type: "updateBlockMarkdown",
      });
      applyDocumentTransactionResult(result);
      setStatus(`Edited block ${block.index + 1}.`);
    } catch (error) {
      setStatus(`Edit failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const loadMarkdownFileForDisplay = (path: string) => {
    setStatus(`Loading ${path}...`);
    const startedAt = Date.now();
    void loadMarkdownFile(path, { initialBlockCount: MARKDOWN_INITIAL_BLOCK_COUNT })
      .then((result) => {
        const finishedAt = Date.now();
        const timing = result.document.getTiming();
        replaceDocument(result.document, path, result.document.getRenderBlocks(0, MARKDOWN_INITIAL_BLOCK_COUNT));
        setStatus(
          `Loaded ${result.document.blockCount} render blocks from ${path.split("/").pop() ?? path} in ${formatDuration(
            finishedAt - startedAt,
          )}; ${formatTiming(timing)}.`,
        );
      })
      .catch((error: unknown) => {
        setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
      });
  };

  const chooseMarkdownFileForLoad = () => {
    void openFileDialog({
      allowedFileTypes: ["md", "mdown", "markdown"],
      allowsMultipleSelection: false,
    }).then((paths) => {
      const path = paths?.[0];
      if (!path) {
        setStatus("File selection canceled.");
        return;
      }
      loadMarkdownFileForDisplay(path);
    });
  };

  return (
    <View style={styles.markdownViewerPanel}>
      <View style={styles.markdownViewerHeader}>
        <Text style={styles.panelTitle}>Markdown Parser</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <View style={styles.markdownViewerActions}>
          <ExampleButton onPress={chooseMarkdownFileForLoad}>Load File</ExampleButton>
        </View>
      </View>
      <LegendList
        contentContainerStyle={styles.markdownListContent}
        data={blockIndices}
        estimatedItemSize={120}
        extraData={`${documentRevision}:${editingBlockId ?? ""}:${editingSelection}`}
        key={documentKey}
        keyExtractor={(item) => String(item)}
        onLoad={() => {
          if (document) {
            hydrateRemainingBlocks(document, documentVersionRef.current);
          }
        }}
        recycleItems
        renderItem={(props) => (
          <MarkdownBlockRow
            {...props}
            blockCache={blockCacheRef.current}
            document={document}
            editingBlockId={editingBlockId}
            editingSelection={editingSelection}
            onCommitMarkdown={commitBlockMarkdown}
            onFinishEditing={(block) => {
              setEditingBlockId((currentId) => (currentId === block.id ? undefined : currentId));
            }}
            onStartEditing={(block, selection) => {
              setEditingBlockId(block.id);
              setEditingSelection(selection);
            }}
          />
        )}
        style={styles.markdownList}
      />
    </View>
  );
}
