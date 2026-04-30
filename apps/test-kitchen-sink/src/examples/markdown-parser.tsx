import { openFileDialog } from "@legend-desktop/file-dialog";
import {
  parseMarkdown,
  parseMarkdownDocument,
  parseMarkdownDocumentWithMd4c,
  parseMarkdownFile,
  parseMarkdownFileDocument,
  parseMarkdownFileDocumentRenderWindow,
  parseMarkdownFileDocumentWindow,
  parseMarkdownFileDocumentWithMd4c,
  scanMarkdown,
  scanMarkdownFile,
  type MarkdownBlock,
  type MarkdownBlockSnapshot,
  type MarkdownDocument,
  type MarkdownDocumentTiming,
  type MarkdownRenderBlock,
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

type MarkdownViewerBlock = MarkdownBlockSnapshot & { runs: MarkdownBlock["runs"] };
type MarkdownBenchmarkMode =
  | "scan-window"
  | "scan-window-combined"
  | "scan-render-shape"
  | "scan-full"
  | "md4c-window"
  | "md4c-full"
  | "json"
  | "turbo-scan-json";

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
  return blocks
    .filter((block) => !!block.markdown && block.type !== "document")
    .map((block) => ({ ...block, markdown: block.markdown ?? "" }));
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

function markdownRenderBlocks(blocks: readonly MarkdownRenderBlock[]): MarkdownViewerBlock[] {
  return blocks.map((block) => ({
    ...block,
    id: String(block.index),
    runs: [],
    text: block.markdown,
  }));
}

function markdownViewerBlockFromMarkdown(index: number, markdown: string): MarkdownViewerBlock {
  return {
    depth: 1,
    id: String(index),
    index,
    markdown,
    runs: [],
    text: "",
    type: "paragraph",
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

  const block = markdownViewerBlockFromMarkdown(index, document.getBlockMarkdown(index));
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

function benchmarkModeLabel(mode: MarkdownBenchmarkMode) {
  if (mode === "md4c-window") {
    return "md4c window";
  }
  if (mode === "md4c-full") {
    return "md4c full";
  }
  if (mode === "scan-window-combined") {
    return "scan window combined";
  }
  if (mode === "scan-render-shape") {
    return "Render Shape";
  }
  if (mode === "turbo-scan-json") {
    return "Turbo Scanner JSON";
  }
  return mode.replace("scan-", "scan ");
}

function timingPayload(timing: MarkdownDocumentTiming) {
  return {
    blockRangeMs: Math.round(timing.blockRangeMs * 100) / 100,
    documentMs: Math.round(timing.documentMs * 100) / 100,
    mdParseMs: Math.round(timing.mdParseMs * 100) / 100,
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
      ...(currentBlock ?? markdownViewerBlockFromMarkdown(index, "")),
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

  const benchmarkGeneratedMarkdown = (mode: MarkdownBenchmarkMode) => {
    const debugMarkdown = createGeneratedMarkdown(8000);
    const sizeLabel = markdownSizeLabel(debugMarkdown);

    if (mode === "json" || mode === "turbo-scan-json") {
      setStatus(`Benchmarking ${sizeLabel} generated markdown with ${benchmarkModeLabel(mode)}...`);
      const startedAt = Date.now();
      const parsePromise =
        mode === "turbo-scan-json"
          ? scanMarkdown(debugMarkdown, { dialect: "github" })
          : parseMarkdown(debugMarkdown, { dialect: "github" });
      void parsePromise
        .then((parsed) => {
          const parsedAt = Date.now();
          const blocks = markdownViewerBlocks(parsed.blocks);
          const finishedAt = Date.now();
          const totalMs = finishedAt - startedAt;
          const benchmarkPayload = {
            event: "app:markdown-json-benchmark",
            blocks: blocks.length,
            extractMs: finishedAt - parsedAt,
            mode,
            parseMs: parsedAt - startedAt,
            sizeBytes: debugMarkdown.length,
            totalMs,
          };

          console.log("markdown json benchmark", benchmarkPayload);
          void fetch("http://127.0.0.1:37531/ll-debug", {
            body: JSON.stringify(benchmarkPayload),
            headers: { "content-type": "application/json" },
            method: "POST",
          }).catch(() => {});
          setStatus(
            `${benchmarkModeLabel(mode)} benchmark ${sizeLabel}: ${blocks.length} blocks in ${formatDuration(
              totalMs,
            )} (${formatDuration(parsedAt - startedAt)} parse, ${formatDuration(finishedAt - parsedAt)} extract).`,
          );
        })
        .catch((error: unknown) => {
          setStatus(`${benchmarkModeLabel(mode)} benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      return;
    }

    setStatus(`Benchmarking ${sizeLabel} generated markdown with ${benchmarkModeLabel(mode)}...`);
    const startedAt = Date.now();
    const document =
      mode === "md4c-window" || mode === "md4c-full"
        ? parseMarkdownDocumentWithMd4c(debugMarkdown, { dialect: "github" })
        : parseMarkdownDocument(debugMarkdown, { dialect: "github" });
    const parsedAt = Date.now();
    const extractedBlocks =
      mode === "scan-window" || mode === "md4c-window"
        ? markdownDocumentWindow(document, 64)
        : mode === "scan-full" || mode === "md4c-full"
          ? markdownDocumentBlocks(document)
          : [];
    const finishedAt = Date.now();
    const timing = document.getTiming();
    const benchmarkPayload = {
      event: "app:markdown-nitro-benchmark",
      extractedBlocks: extractedBlocks.length,
      mode,
      nitroBlocks: document.blockCount,
      nitroExtractMs: finishedAt - parsedAt,
      nitroParseMs: parsedAt - startedAt,
      nitroTiming: timingPayload(timing),
      nitroTotalMs: finishedAt - startedAt,
      sizeBytes: debugMarkdown.length,
    };

    console.log("markdown nitro benchmark", benchmarkPayload);
    void fetch("http://127.0.0.1:37531/ll-debug", {
      body: JSON.stringify(benchmarkPayload),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => {});
    replaceDocument(document, `generated-${mode}`, extractedBlocks);
    setStatus(
      `${benchmarkModeLabel(mode)} benchmark ${sizeLabel}: ${document.blockCount} blocks in ${formatDuration(
        finishedAt - startedAt,
      )} (${formatDuration(parsedAt - startedAt)} parse, ${formatDuration(finishedAt - parsedAt)} extract). Native: ${formatDuration(
        timing.readMs + timing.parseMs + timing.documentMs,
      )}.`,
    );
  };

  const benchmarkMarkdownFile = (path: string, mode: MarkdownBenchmarkMode) => {
    if (mode === "json" || mode === "turbo-scan-json") {
      setStatus(`Benchmarking ${path} with ${benchmarkModeLabel(mode)}...`);
      const startedAt = Date.now();
      const parsePromise =
        mode === "turbo-scan-json"
          ? scanMarkdownFile(path, { dialect: "github" })
          : parseMarkdownFile(path, { dialect: "github" });
      void parsePromise
        .then((parsed) => {
          const parsedAt = Date.now();
          const blocks = markdownViewerBlocks(parsed.blocks);
          const finishedAt = Date.now();
          const totalMs = finishedAt - startedAt;
          const benchmarkPayload = {
            event: "app:markdown-file-json-benchmark",
            blocks: blocks.length,
            extractMs: finishedAt - parsedAt,
            mode,
            parseMs: parsedAt - startedAt,
            source: path,
            totalMs,
          };

          console.log("markdown file json benchmark", benchmarkPayload);
          void fetch("http://127.0.0.1:37531/ll-debug", {
            body: JSON.stringify(benchmarkPayload),
            headers: { "content-type": "application/json" },
            method: "POST",
          }).catch(() => {});
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark ${path.split("/").pop() ?? path}: ${
              blocks.length
            } blocks in ${formatDuration(totalMs)} (${formatDuration(parsedAt - startedAt)} parse, ${formatDuration(
              finishedAt - parsedAt,
            )} extract).`,
          );
        })
        .catch((error: unknown) => {
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      return;
    }

    setStatus(`Benchmarking ${path} with ${benchmarkModeLabel(mode)}...`);
    const startedAt = Date.now();
    if (mode === "scan-window-combined") {
      void parseMarkdownFileDocumentWindow(path, 64)
        .then((result) => {
          const parsedAt = Date.now();
          const extractedBlocks = markdownSnapshotBlocks(result.blocks);
          const finishedAt = Date.now();
          const document = result.document;
          const timing = document.getTiming();
          const benchmarkPayload = {
            event: "app:markdown-file-nitro-benchmark",
            extractedBlocks: extractedBlocks.length,
            mode,
            nitroBlocks: document.blockCount,
            nitroExtractMs: finishedAt - parsedAt,
            nitroParseMs: parsedAt - startedAt,
            nitroTiming: timingPayload(timing),
            nitroTotalMs: finishedAt - startedAt,
            source: path,
          };

          console.log("markdown file nitro benchmark", benchmarkPayload);
          void fetch("http://127.0.0.1:37531/ll-debug", {
            body: JSON.stringify(benchmarkPayload),
            headers: { "content-type": "application/json" },
            method: "POST",
          }).catch(() => {});
          replaceDocument(document, path, extractedBlocks);
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark ${path.split("/").pop() ?? path}: ${
              document.blockCount
            } blocks in ${formatDuration(finishedAt - startedAt)} (${formatDuration(
              parsedAt - startedAt,
            )} parse+window, ${formatDuration(finishedAt - parsedAt)} JS convert). Native: ${formatDuration(
              timing.readMs + timing.parseMs + timing.documentMs,
            )}.`,
          );
        })
        .catch((error: unknown) => {
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }

    if (mode === "scan-render-shape") {
      void parseMarkdownFileDocumentRenderWindow(path, 64)
        .then((result) => {
          const parsedAt = Date.now();
          const extractedBlocks = markdownRenderBlocks(result.blocks);
          const finishedAt = Date.now();
          const document = result.document;
          const timing = document.getTiming();
          const benchmarkPayload = {
            event: "app:markdown-file-nitro-benchmark",
            extractedBlocks: extractedBlocks.length,
            mode,
            nitroBlocks: document.blockCount,
            nitroExtractMs: finishedAt - parsedAt,
            nitroParseMs: parsedAt - startedAt,
            nitroTiming: timingPayload(timing),
            nitroTotalMs: finishedAt - startedAt,
            source: path,
          };

          console.log("markdown file nitro benchmark", benchmarkPayload);
          void fetch("http://127.0.0.1:37531/ll-debug", {
            body: JSON.stringify(benchmarkPayload),
            headers: { "content-type": "application/json" },
            method: "POST",
          }).catch(() => {});
          replaceDocument(document, path, extractedBlocks);
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark ${path.split("/").pop() ?? path}: ${
              document.blockCount
            } blocks in ${formatDuration(finishedAt - startedAt)} (${formatDuration(
              parsedAt - startedAt,
            )} parse+render-shape, ${formatDuration(finishedAt - parsedAt)} JS handoff). Native: ${formatDuration(
              timing.readMs + timing.parseMs + timing.documentMs,
            )}.`,
          );
        })
        .catch((error: unknown) => {
          setStatus(
            `File ${benchmarkModeLabel(mode)} benchmark failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }

    const documentPromise =
      mode === "md4c-window" || mode === "md4c-full"
        ? parseMarkdownFileDocumentWithMd4c(path, { dialect: "github" })
        : parseMarkdownFileDocument(path, { dialect: "github" });
    void documentPromise.then((document) => {
      const parsedAt = Date.now();
      const extractedBlocks =
        mode === "scan-window" || mode === "md4c-window"
          ? markdownDocumentWindow(document, 64)
          : mode === "scan-full" || mode === "md4c-full"
            ? markdownDocumentBlocks(document)
            : [];
      const finishedAt = Date.now();
      const timing = document.getTiming();
      const benchmarkPayload = {
        event: "app:markdown-file-nitro-benchmark",
        extractedBlocks: extractedBlocks.length,
        mode,
        nitroBlocks: document.blockCount,
        nitroExtractMs: finishedAt - parsedAt,
        nitroParseMs: parsedAt - startedAt,
        nitroTiming: timingPayload(timing),
        nitroTotalMs: finishedAt - startedAt,
        source: path,
      };

      console.log("markdown file nitro benchmark", benchmarkPayload);
      void fetch("http://127.0.0.1:37531/ll-debug", {
        body: JSON.stringify(benchmarkPayload),
        headers: { "content-type": "application/json" },
        method: "POST",
      }).catch(() => {});
      replaceDocument(document, path, extractedBlocks);
      setStatus(
        `File ${benchmarkModeLabel(mode)} benchmark ${path.split("/").pop() ?? path}: ${
          document.blockCount
        } blocks in ${formatDuration(finishedAt - startedAt)} (${formatDuration(
          parsedAt - startedAt,
        )} parse, ${formatDuration(finishedAt - parsedAt)} extract). Native: ${formatDuration(
          timing.readMs + timing.parseMs + timing.documentMs,
        )}.`,
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

  const chooseMarkdownFileForBenchmark = (mode: MarkdownBenchmarkMode) => {
    void openFileDialog({
      allowedFileTypes: ["md", "mdown", "markdown"],
      allowsMultipleSelection: false,
    }).then((paths) => {
      const path = paths?.[0];
      if (!path) {
        setStatus("File selection canceled.");
        return;
      }
      benchmarkMarkdownFile(path, mode);
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
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("scan-window")}>Scan Window</ExampleButton>
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("scan-full")}>Scan Full</ExampleButton>
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("md4c-window")}>MD4C Window</ExampleButton>
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("md4c-full")}>MD4C Full</ExampleButton>
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("json")}>JSON Compare</ExampleButton>
          <ExampleButton onPress={() => benchmarkGeneratedMarkdown("turbo-scan-json")}>Turbo Scanner JSON</ExampleButton>
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
                benchmarkMarkdownFile(path, "scan-window");
              });
            }}
          >
            File Window
          </ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("scan-window-combined")}>
            File Window Combined
          </ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("scan-render-shape")}>Render Shape</ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("scan-full")}>File Full</ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("md4c-window")}>File MD4C</ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("md4c-full")}>File MD4C Full</ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("json")}>File JSON</ExampleButton>
          <ExampleButton onPress={() => chooseMarkdownFileForBenchmark("turbo-scan-json")}>
            File Turbo Scanner JSON
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
