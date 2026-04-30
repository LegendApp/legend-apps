import { openFileDialog } from "@legend-desktop/file-dialog";
import {
  parseMarkdown,
  parseMarkdownDocument,
  parseMarkdownFile,
  parseMarkdownFileDocument,
  type MarkdownBlock,
  type MarkdownBlockSnapshot,
  type MarkdownDocument,
  type MarkdownDocumentTiming,
} from "@legend-desktop/markdown-parser";
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

const markdownParserSample = `# Markdown Parser

This paragraph has **strong text**, _emphasis_, and [a link](https://legendapp.com).

- [x] Parse block structure
- [ ] Render spans in React

> Native parsing supplies virtualized block rows. React still owns markdown rendering.

| Block | Renderer |
| --- | --- |
| Native | md4c |
| React | EnrichedMarkdownText |

\`\`\`tsx
<Text>Rendered by React Native</Text>
\`\`\`
`;

type MarkdownViewerBlock = MarkdownBlock & { markdown: string };

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

function markdownViewerBlocks(blocks: readonly MarkdownBlock[]): MarkdownViewerBlock[] {
  return blocks.filter((block): block is MarkdownViewerBlock => !!block.markdown && block.type !== "document");
}

function markdownSnapshotBlocks(blocks: readonly MarkdownBlockSnapshot[]): MarkdownViewerBlock[] {
  return blocks.filter((block) => !!block.markdown && block.type !== "document").map(markdownSnapshotBlock);
}

function markdownSnapshotBlock(block: MarkdownBlockSnapshot): MarkdownViewerBlock {
  return {
    ...block,
    runs: [],
  };
}

function markdownDocumentBlocks(document: MarkdownDocument, includeText = false): MarkdownViewerBlock[] {
  return markdownSnapshotBlocks(document.getBlocks(0, document.blockCount, includeText));
}

function markdownDocumentWindow(document: MarkdownDocument, count: number, includeText = false): MarkdownViewerBlock[] {
  return markdownSnapshotBlocks(document.getBlocks(0, Math.min(document.blockCount, count), includeText));
}

function markdownDocumentIndices(document: MarkdownDocument) {
  return Array.from({ length: document.blockCount }, (_, index) => index);
}

function getCachedMarkdownBlock(
  document: MarkdownDocument,
  index: number,
  cache: Map<number, MarkdownViewerBlock>,
  overrides: Map<number, MarkdownViewerBlock>,
) {
  const override = overrides.get(index);
  if (override) {
    return override;
  }

  const cached = cache.get(index);
  if (cached) {
    return cached;
  }

  const block = markdownSnapshotBlock(document.getBlock(index, false));
  cache.set(index, block);
  return block;
}

function formatDuration(durationMs: number) {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

function createGeneratedMarkdown(sectionCount: number) {
  return Array.from(
    { length: sectionCount },
    (_, index) =>
      `## Generated section ${index + 1}\n\nThis is generated markdown row ${
        index + 1
      } with **bold text**, [a link](https://legendapp.com), and enough content to make the rendered row dynamically sized for the list measurement path.`,
  ).join("\n\n");
}

function markdownSizeLabel(markdown: string) {
  return `${(markdown.length / 1024 / 1024).toFixed(2)} MB`;
}

function timingPayload(timing: MarkdownDocumentTiming) {
  return {
    documentMs: Math.round(timing.documentMs * 100) / 100,
    nativeParseMs: Math.round(timing.parseMs * 100) / 100,
    readMs: Math.round(timing.readMs * 100) / 100,
    sourceBytes: timing.sourceBytes,
  };
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
      return Math.min(markdown.length, offset + Math.min(line.length, wrappedLine * charactersPerLine + characterInVisualLine));
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
  initialSelection,
  item,
  onCommitMarkdown,
  onFinishEditing,
  width,
}: {
  initialSelection: number;
  item: MarkdownViewerBlock;
  onCommitMarkdown: (id: string, markdown: string) => void;
  onFinishEditing: (id: string) => void;
  width: number;
}) {
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const didPlaceCursorRef = useRef(false);
  const draftMarkdownRef = useRef(item.markdown);
  const [draftMarkdown, setDraftMarkdown] = useState(item.markdown);

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
      defaultValue={item.markdown}
      markdownStyle={markdownEditorStyle}
      onBlur={() => {
        const input = inputRef.current;
        if (!input) {
          onCommitMarkdown(item.id, draftMarkdownRef.current);
          onFinishEditing(item.id);
          return;
        }

        void input
          .getMarkdown()
          .then((markdown) => {
            onCommitMarkdown(item.id, markdown);
          })
          .catch(() => {
            onCommitMarkdown(item.id, draftMarkdownRef.current);
          })
          .finally(() => {
            onFinishEditing(item.id);
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
  blockOverrides,
  document,
  editingId,
  editingSelection,
  item,
  onCommitMarkdown,
  onFinishEditing,
  onStartEditing,
}: LegendListRenderItemProps<number> & {
  blockCache: Map<number, MarkdownViewerBlock>;
  blockOverrides: Map<number, MarkdownViewerBlock>;
  document?: MarkdownDocument;
  editingId?: number;
  editingSelection: number;
  onCommitMarkdown: (index: number, markdown: string) => void;
  onFinishEditing: (index: number) => void;
  onStartEditing: (index: number, selection: number) => void;
}) {
  const [rowWidth, setRowWidth] = useState(700);
  const block = document ? getCachedMarkdownBlock(document, item, blockCache, blockOverrides) : undefined;
  const isEditing = item === editingId;

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
          onStartEditing(item, estimateMarkdownSelection(block.markdown, event, rowWidth));
        }
      }}
      style={styles.markdownBlockRow}
    >
      {isEditing ? (
        <MarkdownBlockEditor
          initialSelection={editingSelection}
          item={block}
          onCommitMarkdown={(_, markdown) => onCommitMarkdown(item, markdown)}
          onFinishEditing={() => onFinishEditing(item)}
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
  const blockCacheRef = useRef(new Map<number, MarkdownViewerBlock>());
  const documentVersionRef = useRef(0);
  const [blockIndices, setBlockIndices] = useState<number[]>([]);
  const [blockOverrides, setBlockOverrides] = useState(() => new Map<number, MarkdownViewerBlock>());
  const [document, setDocument] = useState<MarkdownDocument | undefined>();
  const [documentKey, setDocumentKey] = useState("initial");
  const [editingBlockId, setEditingBlockId] = useState<number | undefined>();
  const [editingSelection, setEditingSelection] = useState(0);
  const [status, setStatus] = useState("Loading sample markdown...");

  const replaceDocument = (nextDocument: MarkdownDocument, source: string, initialBlocks: readonly MarkdownViewerBlock[] = []) => {
    documentVersionRef.current += 1;
    blockCacheRef.current.clear();
    for (const block of initialBlocks) {
      blockCacheRef.current.set(block.index, block);
    }
    setEditingBlockId(undefined);
    setEditingSelection(0);
    setBlockOverrides(new Map());
    setDocument(nextDocument);
    setDocumentKey(`${source}:${nextDocument.sourceSize}:${nextDocument.blockCount}:${documentVersionRef.current}`);
    setBlockIndices(markdownDocumentIndices(nextDocument));
  };

  const commitBlockMarkdown = (index: number, markdown: string) => {
    const currentBlock = document ? getCachedMarkdownBlock(document, index, blockCacheRef.current, blockOverrides) : undefined;
    const nextBlock = {
      ...(currentBlock ?? {
        depth: 1,
        id: String(index),
        index,
        runs: [],
        text: "",
        type: "paragraph",
      }),
      markdown,
      text: markdown,
    };
    blockCacheRef.current.set(index, nextBlock);
    setBlockOverrides((currentOverrides) => {
      const nextOverrides = new Map(currentOverrides);
      nextOverrides.set(index, nextBlock);
      return nextOverrides;
    });
  };

  useEffect(() => {
    const debugMarkdown = createGeneratedMarkdown(2500);
    const startedAt = Date.now();
    void fetch("http://127.0.0.1:37531/ll-debug", {
      body: JSON.stringify({ event: "app:nitro-parse-start", now: startedAt, source: "MarkdownParserExample" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => {});
    const document = parseMarkdownDocument(debugMarkdown, { dialect: "github" });
    const parsedAt = Date.now();
    const viewerBlocks = markdownDocumentWindow(document, 64);
    const finishedAt = Date.now();
    const timing = document.getTiming();
    void fetch("http://127.0.0.1:37531/ll-debug", {
      body: JSON.stringify({
        event: "app:nitro-parse-done",
        firstWindowExtractMs: finishedAt - parsedAt,
        now: finishedAt,
        parseMs: parsedAt - startedAt,
        renderBlocks: document.blockCount,
        source: "MarkdownParserExample",
        timing: timingPayload(timing),
        totalMs: finishedAt - startedAt,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => {});
    replaceDocument(document, "generated-initial", viewerBlocks);
    setStatus(
      `Generated sample loaded with Nitro: ${document.blockCount} render blocks in ${formatDuration(
        finishedAt - startedAt,
      )}; first ${viewerBlocks.length} blocks extracted in ${formatDuration(finishedAt - parsedAt)}.`,
    );
  }, []);

  const loadSampleWithNitro = () => {
    setStatus("Parsing sample markdown with Nitro...");
    const startedAt = Date.now();
    const document = parseMarkdownDocument(markdownParserSample, { dialect: "github" });
    const parsedAt = Date.now();
    const viewerBlocks = markdownDocumentWindow(document, 64);
    const finishedAt = Date.now();
    replaceDocument(document, "sample", viewerBlocks);
    setStatus(
      `Nitro sample loaded: ${document.blockCount} render blocks in ${formatDuration(
        finishedAt - startedAt,
      )} (${formatDuration(parsedAt - startedAt)} parse, ${formatDuration(finishedAt - parsedAt)} first-window extract).`,
    );
  };

  const benchmarkGeneratedMarkdown = () => {
    const debugMarkdown = createGeneratedMarkdown(8000);
    setStatus(`Benchmarking ${markdownSizeLabel(debugMarkdown)} generated markdown...`);
    const legacyStartedAt = Date.now();
    void parseMarkdown(debugMarkdown, { dialect: "github" }).then((parsed) => {
      const legacyParsedAt = Date.now();
      const legacyBlocks = markdownViewerBlocks(parsed.blocks);
      const legacyFinishedAt = Date.now();
      const nitroStartedAt = Date.now();
      const document = parseMarkdownDocument(debugMarkdown, { dialect: "github" });
      const nitroParsedAt = Date.now();
      const nitroWindowBlocks = markdownDocumentWindow(document, 64);
      const nitroWindowFinishedAt = Date.now();
      const nitroBlocks = markdownDocumentBlocks(document);
      const nitroFullFinishedAt = Date.now();
      const legacyTotal = legacyFinishedAt - legacyStartedAt;
      const nitroWindowTotal = nitroWindowFinishedAt - nitroStartedAt;
      const nitroFullTotal = nitroFullFinishedAt - nitroStartedAt;
      const improvement = legacyTotal > 0 ? Math.round(((legacyTotal - nitroWindowTotal) / legacyTotal) * 100) : 0;
      const timing = document.getTiming();
      const benchmarkPayload = {
        event: "app:markdown-benchmark",
        legacyBlocks: legacyBlocks.length,
        legacyExtractMs: legacyFinishedAt - legacyParsedAt,
        legacyParseMs: legacyParsedAt - legacyStartedAt,
        legacyTotalMs: legacyTotal,
        nitroBlocks: nitroBlocks.length,
        nitroFullExtractMs: nitroFullFinishedAt - nitroWindowFinishedAt,
        nitroFullTotalMs: nitroFullTotal,
        nitroParseMs: nitroParsedAt - nitroStartedAt,
        nitroTiming: timingPayload(timing),
        nitroWindowBlocks: nitroWindowBlocks.length,
        nitroWindowExtractMs: nitroWindowFinishedAt - nitroParsedAt,
        nitroWindowTotalMs: nitroWindowTotal,
        sizeBytes: debugMarkdown.length,
      };

      console.log("markdown benchmark", benchmarkPayload);
      void fetch("http://127.0.0.1:37531/ll-debug", {
        body: JSON.stringify(benchmarkPayload),
        headers: { "content-type": "application/json" },
        method: "POST",
      }).catch(() => {});
      replaceDocument(document, "generated-benchmark", nitroWindowBlocks);
      setStatus(
        `Benchmark ${markdownSizeLabel(debugMarkdown)}: Turbo JSON ${formatDuration(
          legacyTotal,
        )}, Nitro first window ${formatDuration(nitroWindowTotal)} (${improvement}% faster), full extract ${formatDuration(
          nitroFullTotal,
        )}. Nitro native: ${formatDuration(timing.readMs + timing.parseMs + timing.documentMs)} (${formatDuration(
          nitroParsedAt - nitroStartedAt,
        )} JS boundary).`,
      );
    });
  };

  const loadMarkdownFileWithNitro = (path: string) => {
    setStatus(`Parsing ${path} with Nitro...`);
    const startedAt = Date.now();
    void parseMarkdownFileDocument(path, { dialect: "github" }).then((document) => {
      const parsedAt = Date.now();
      const viewerBlocks = markdownDocumentWindow(document, 64);
      const finishedAt = Date.now();
      const timing = document.getTiming();
      void fetch("http://127.0.0.1:37531/ll-debug", {
        body: JSON.stringify({
          event: "app:nitro-file-parse-done",
          firstWindowExtractMs: finishedAt - parsedAt,
          now: finishedAt,
          parseMs: parsedAt - startedAt,
          renderBlocks: document.blockCount,
          source: path,
          timing: timingPayload(timing),
          totalMs: finishedAt - startedAt,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }).catch(() => {});
      replaceDocument(document, path, viewerBlocks);
      setStatus(
        `Nitro loaded ${document.blockCount} render blocks from ${path.split("/").pop() ?? path} in ${formatDuration(
          finishedAt - startedAt,
        )} (${formatDuration(parsedAt - startedAt)} parse, ${formatDuration(finishedAt - parsedAt)} first-window extract).`,
      );
    });
  };

  const benchmarkMarkdownFile = (path: string) => {
    setStatus(`Benchmarking ${path}...`);
    const legacyStartedAt = Date.now();
    void parseMarkdownFile(path, { dialect: "github" }).then((parsed) => {
      const legacyParsedAt = Date.now();
      const legacyBlocks = markdownViewerBlocks(parsed.blocks);
      const legacyFinishedAt = Date.now();
      const nitroStartedAt = Date.now();
      void parseMarkdownFileDocument(path, { dialect: "github" }).then((document) => {
        const nitroParsedAt = Date.now();
        const nitroWindowBlocks = markdownDocumentWindow(document, 64);
        const nitroWindowFinishedAt = Date.now();
        const nitroBlocks = markdownDocumentBlocks(document);
        const nitroFullFinishedAt = Date.now();
        const legacyTotal = legacyFinishedAt - legacyStartedAt;
        const nitroWindowTotal = nitroWindowFinishedAt - nitroStartedAt;
        const nitroFullTotal = nitroFullFinishedAt - nitroStartedAt;
        const improvement = legacyTotal > 0 ? Math.round(((legacyTotal - nitroWindowTotal) / legacyTotal) * 100) : 0;
        const timing = document.getTiming();
        const benchmarkPayload = {
          event: "app:markdown-file-benchmark",
          legacyBlocks: legacyBlocks.length,
          legacyExtractMs: legacyFinishedAt - legacyParsedAt,
          legacyParseMs: legacyParsedAt - legacyStartedAt,
          legacyTotalMs: legacyTotal,
          nitroBlocks: nitroBlocks.length,
          nitroFullExtractMs: nitroFullFinishedAt - nitroWindowFinishedAt,
          nitroFullTotalMs: nitroFullTotal,
          nitroParseMs: nitroParsedAt - nitroStartedAt,
          nitroTiming: timingPayload(timing),
          nitroWindowBlocks: nitroWindowBlocks.length,
          nitroWindowExtractMs: nitroWindowFinishedAt - nitroParsedAt,
          nitroWindowTotalMs: nitroWindowTotal,
          source: path,
        };

        console.log("markdown file benchmark", benchmarkPayload);
        void fetch("http://127.0.0.1:37531/ll-debug", {
          body: JSON.stringify(benchmarkPayload),
          headers: { "content-type": "application/json" },
          method: "POST",
        }).catch(() => {});
        replaceDocument(document, path, nitroWindowBlocks);
        setStatus(
          `File benchmark ${path.split("/").pop() ?? path}: Turbo JSON ${formatDuration(
            legacyTotal,
          )}, Nitro first window ${formatDuration(nitroWindowTotal)} (${improvement}% faster), full extract ${formatDuration(
            nitroFullTotal,
          )}. Nitro native: ${formatDuration(timing.readMs + timing.parseMs + timing.documentMs)} (${formatDuration(
            nitroParsedAt - nitroStartedAt,
          )} JS boundary).`,
        );
      });
    });
  };

  console.log("blocks", blockIndices.length);

  return (
    <View style={styles.markdownViewerPanel}>
      <View style={styles.markdownViewerHeader}>
        <Text style={styles.panelTitle}>Markdown Parser</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <View style={styles.markdownViewerActions}>
          <ExampleButton onPress={loadSampleWithNitro}>Load Sample</ExampleButton>
          <ExampleButton onPress={benchmarkGeneratedMarkdown}>Benchmark Generated</ExampleButton>
          <ExampleButton
            onPress={() => {
              void openFileDialog({
                allowedFileTypes: ["md", "mdown", "markdown"],
                allowsMultipleSelection: false,
              }).then((paths) => {
                const path = paths?.[0];
                if (!path) {
                  setStatus("File selection canceled.");
                  return;
                }
                loadMarkdownFileWithNitro(path);
              });
            }}
          >
            Choose Markdown File
          </ExampleButton>
          <ExampleButton
            onPress={() => {
              void openFileDialog({
                allowedFileTypes: ["md", "mdown", "markdown"],
                allowsMultipleSelection: false,
              }).then((paths) => {
                const path = paths?.[0];
                if (!path) {
                  setStatus("File selection canceled.");
                  return;
                }
                benchmarkMarkdownFile(path);
              });
            }}
          >
            Benchmark File
          </ExampleButton>
        </View>
      </View>
      <LegendList
        contentContainerStyle={styles.markdownListContent}
        data={blockIndices}
        estimatedItemSize={120}
        extraData={`${documentKey}:${editingBlockId ?? ""}:${editingSelection}:${blockOverrides.size}`}
        keyExtractor={(item) => String(item)}
        recycleItems
        renderItem={(props) => (
          <MarkdownBlockRow
            {...props}
            blockCache={blockCacheRef.current}
            blockOverrides={blockOverrides}
            document={document}
            editingId={editingBlockId}
            editingSelection={editingSelection}
            onCommitMarkdown={commitBlockMarkdown}
            onFinishEditing={(id) => {
              setEditingBlockId((currentId) => (currentId === id ? undefined : currentId));
            }}
            onStartEditing={(id, selection) => {
              setEditingBlockId(id);
              setEditingSelection(selection);
            }}
          />
        )}
        style={styles.markdownList}
      />
    </View>
  );
}
