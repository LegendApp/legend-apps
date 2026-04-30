import { openFileDialog } from "@legend-desktop/file-dialog";
import {
  loadMarkdownFile,
  type MarkdownDocument,
  type MarkdownDocumentTiming,
  type MarkdownRenderBlock,
} from "@legend-desktop/markdown-parser";
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useRef, useState } from "react";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { Linking, Text, View } from "react-native";
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

function MarkdownBlockRow({
  blockCache,
  document,
  item,
}: LegendListRenderItemProps<number> & {
  blockCache: Map<number, MarkdownRenderBlock>;
  document?: MarkdownDocument;
}) {
  const block = document ? getCachedMarkdownBlock(document, item, blockCache) : undefined;

  if (!block) {
    return null;
  }

  return (
    <View style={styles.markdownBlockRow}>
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
    </View>
  );
}

export function MarkdownParserExample() {
  const blockCacheRef = useRef(new Map<number, MarkdownRenderBlock>());
  const documentVersionRef = useRef(0);
  const hydrateFrameRef = useRef<number | undefined>(undefined);
  const [blockIndices, setBlockIndices] = useState<number[]>([]);
  const [document, setDocument] = useState<MarkdownDocument | undefined>();
  const [documentKey, setDocumentKey] = useState("initial");
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
    setBlockIndices(markdownDocumentIndices(nextDocument));
  };

  const loadMarkdownFileForDisplay = (path: string) => {
    setStatus(`Loading ${path}...`);
    const startedAt = Date.now();
    void loadMarkdownFile(path, { initialBlockCount: MARKDOWN_INITIAL_BLOCK_COUNT })
      .then((result) => {
        const finishedAt = Date.now();
        const timing = result.document.getTiming();
        replaceDocument(result.document, path, result.initialBlocks);
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
        extraData={documentKey}
        key={documentKey}
        keyExtractor={(item) => String(item)}
        onLoad={() => {
          if (document) {
            hydrateRemainingBlocks(document, documentVersionRef.current);
          }
        }}
        recycleItems
        renderItem={(props) => (
          <MarkdownBlockRow {...props} blockCache={blockCacheRef.current} document={document} />
        )}
        style={styles.markdownList}
      />
    </View>
  );
}
