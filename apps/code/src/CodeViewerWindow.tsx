import { openSelectedDocumentPath, useWatchedDocumentReload } from "@legend-apps/document-app";
import { noteRecentDocument } from "@legend-apps/recent-documents";
import {
  createSyntaxStyleMap,
  formatMs,
  nowMs,
  SourceDocumentView,
  type SourceDocumentSnapshot,
  type SourceDocumentTiming,
  SourceLineRow,
  sourceViewerInitialRequestRowCount,
  sourceViewerLineOverscan,
  sourceViewerOverscanRequestDelayMs,
  toSourceDocumentTiming,
  useSourceDocumentRows,
} from "@legend-apps/source-viewer";
import {
  loadCodeFile,
  type SyntaxDocument,
  type SyntaxRenderLine,
  type SyntaxStyle,
} from "@legend-apps/syntax-parser";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import {
  type VirtualizedFixedDocumentListRenderRowProps,
} from "@legend-apps/virtualized-document";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { codeBackgroundTokenizationChunkLineCount, codeFileTypes, codeInitialLineCount } from "./appConstants";
import { getCodeLanguage, getFilename, getLaunchCodeFile, isCodePath } from "./codeFiles";
import {
  useCodeFontFamilySetting,
  useCodeFontSizeSetting,
  useCodeSyntaxHighlightingEnabledSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
  type CodeSettingsFile,
} from "./codeSettings";
import { codeViewerFileRequest$ } from "./codeViewerRequests";
import { setCodeViewerWindowOptions } from "./codeWindows";

type CodeViewerWindowProps = {
  launchArguments?: string[];
};

type CodeViewerState =
  | {
    status: "empty";
    filePath: null;
    error: null;
  }
  | {
    status: "opening";
    filePath: string;
    error: null;
  }
  | {
    status: "loaded";
    filePath: string;
    error: null;
    document: SyntaxDocument;
    initialLines: SyntaxRenderLine[];
    styles: SyntaxStyle[];
    syntaxTheme: CodeSettingsFile["syntaxTheme"];
    timing: SourceDocumentTiming;
  }
  | {
    status: "error";
    filePath: string | null;
    error: string;
    timing: null;
  };

const emptyState: CodeViewerState = {
  status: "empty",
  filePath: null,
  error: null,
};

function formatLineCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "line" : "lines"}`;
}

function formatTimingSummary(timing: CodeViewerTiming) {
  return [
    `${formatLineCount(timing.lineCount)}`,
    `${timing.tokenCount.toLocaleString()} tokens`,
    `native ${formatMs(timing.nativeTotalMs)}`,
    `js ${formatMs(timing.jsLoadMs)}`,
  ].join(" · ");
}

type CodeViewerTiming = SourceDocumentTiming;

function getCodeLineRowHeight(fontSize: number) {
  return Math.max(20, fontSize + 9);
}

export function CodeViewerWindow({ launchArguments }: CodeViewerWindowProps) {
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxTheme = useCodeSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const [state, setState] = useState<CodeViewerState>(emptyState);
  const launchFile = useMemo(() => getLaunchCodeFile(launchArguments), [launchArguments]);
  const fileRequest = useValue(codeViewerFileRequest$);
  const loadedLaunchFileRef = useRef<string | null>(null);
  const loadedFileRequestVersionRef = useRef(0);
  const loadedFilePath = state.status === "loaded" ? state.filePath : null;
  const documentSnapshot = useMemo<SourceDocumentSnapshot | null>(
    () => state.status === "loaded"
      ? {
          document: state.document,
          initialRows: state.initialLines,
          itemCount: state.document.lineCount,
          styles: state.styles,
          timing: state.timing,
        }
      : null,
    [state],
  );
  const sourceRows = useSourceDocumentRows({
    backgroundTokenizationChunkLineCount: codeBackgroundTokenizationChunkLineCount,
    initialHighlightRowCount: sourceViewerInitialRequestRowCount,
    syntaxHighlightingEnabled,
    snapshot: documentSnapshot,
  });
  const currentDocument = state.status === "loaded" ? state.document : null;
  const stylesForState = sourceRows.styles;
  const tokenStyleById = useMemo(() => createSyntaxStyleMap(stylesForState), [stylesForState]);
  const visibleFilePath = state.filePath ?? launchFile;
  const fileName = visibleFilePath ? getFilename(visibleFilePath) : "No file";
  const backgroundColor = syntaxTheme.background;
  const mutedColor = displayTheme.colors.muted;
  const foregroundColor = syntaxTheme.foreground;
  const borderColor = displayTheme.colors.border;
  const rowHeight = getCodeLineRowHeight(fontSize);
  const lineTextStyle = useMemo(() => ({
    fontFamily,
    fontSize,
    lineHeight: rowHeight,
  }), [fontFamily, fontSize, rowHeight]);
  const lineNumberStyle = useMemo(() => ({
    fontFamily,
    fontSize: Math.max(10, fontSize - 1),
    lineHeight: rowHeight,
  }), [fontFamily, fontSize, rowHeight]);
  const lineRowStyle = useMemo(() => ({
    height: rowHeight,
  }), [rowHeight]);

  useEffect(() => {
    if (__DEV__) {
      globalThis.__legendCodeBenchmarkGetTokenizedLineCount = () => currentDocument?.getTokenizedLineCount() ?? 0;
    }

    return () => {
      if (__DEV__ && globalThis.__legendCodeBenchmarkGetTokenizedLineCount) {
        globalThis.__legendCodeBenchmarkGetTokenizedLineCount = undefined;
      }
    };
  }, [currentDocument]);

  const loadFile = useCallback(async (
    filePath: string,
    syntaxThemeName: CodeSettingsFile["syntaxTheme"],
    shouldHighlightSyntax: boolean,
  ) => {
    const loadStartedAt = nowMs();

    try {
      setState({
        status: "opening",
        filePath,
        error: null,
      });
      const highlighted = await loadCodeFile(
        filePath,
        getCodeLanguage(filePath),
        syntaxThemeName,
        shouldHighlightSyntax ? codeInitialLineCount : 0,
      );
      const loadFinishedAt = nowMs();
      const timing = toSourceDocumentTiming(highlighted.timing, loadFinishedAt - loadStartedAt);

      setState({
        status: "loaded",
        filePath,
        error: null,
        document: highlighted.document,
        initialLines: highlighted.initialLines,
        styles: highlighted.styles,
        syntaxTheme: syntaxThemeName,
        timing,
      });
      noteRecentDocument(filePath);
    } catch (error) {
      setState({
        status: "error",
        filePath,
        error: error instanceof Error ? error.message : String(error),
        timing: null,
      });
    }
  }, []);

  const openCodeDialog = useCallback(async () => {
    try {
      const path = await openSelectedDocumentPath({
        allowedFileTypes: codeFileTypes,
        invalidSelectionMessage: `Choose a TypeScript file (${codeFileTypes.map((type) => `.${type}`).join(", ")}).`,
        isDocumentPath: isCodePath,
      });
      if (path) {
        await loadFile(path, selectedSyntaxTheme, syntaxHighlightingEnabled);
      }
    } catch (error) {
      setState({
        status: "error",
        filePath: state.filePath,
        error: error instanceof Error ? error.message : String(error),
        timing: null,
      });
    }
  }, [loadFile, selectedSyntaxTheme, state.filePath, syntaxHighlightingEnabled]);

  const renderLine = useCallback(
    ({ index: lineIndex, row: line }: VirtualizedFixedDocumentListRenderRowProps<SyntaxRenderLine>) => {
      return (
        <SourceLineRow
          foregroundColor={foregroundColor}
          index={lineIndex}
          line={line}
          lineNumberStyle={lineNumberStyle}
          mutedColor={mutedColor}
          rowStyle={lineRowStyle}
          textStyle={lineTextStyle}
          tokenStyleById={tokenStyleById}
        />
      );
    },
    [foregroundColor, lineNumberStyle, lineRowStyle, lineTextStyle, mutedColor, tokenStyleById],
  );

  useEffect(() => {
    if (launchFile && loadedLaunchFileRef.current !== launchFile) {
      loadedLaunchFileRef.current = launchFile;
      loadFile(launchFile, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [launchFile, loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled]);

  useEffect(() => {
    if (
      fileRequest.path &&
      loadedFileRequestVersionRef.current !== fileRequest.version
    ) {
      loadedFileRequestVersionRef.current = fileRequest.version;
      loadedLaunchFileRef.current = fileRequest.path;
      loadFile(fileRequest.path, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [fileRequest.path, fileRequest.version, loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled]);

  useEffect(() => {
    if (state.status === "loaded" && state.syntaxTheme !== selectedSyntaxTheme) {
      loadFile(state.filePath, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [loadFile, selectedSyntaxTheme, state, syntaxHighlightingEnabled]);

  const reloadLoadedFile = useCallback(() => {
    if (loadedFilePath) {
      loadFile(loadedFilePath, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [loadFile, loadedFilePath, selectedSyntaxTheme, syntaxHighlightingEnabled]);
  useWatchedDocumentReload({
    onReload: reloadLoadedFile,
    path: loadedFilePath,
  });

  useEffect(() => {
    setCodeViewerWindowOptions({
      appearance: syntaxTheme.appearance,
      backgroundColor: syntaxTheme.background,
      filePath: state.filePath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [state.filePath, syntaxTheme.appearance, syntaxTheme.background]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
            {state.status === "loaded" && sourceRows.timing
              ? formatTimingSummary(sourceRows.timing)
              : visibleFilePath ?? "Open a .ts or .tsx file"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={openCodeDialog}
          style={({ pressed }) => [
            styles.openButton,
            { borderColor, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open</Text>
        </Pressable>
      </View>
      {state.error ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{state.error}</Text>
      ) : null}
      {sourceRows.itemIndexes.length > 0 ? (
        <SourceDocumentView
          initialRequestRowCount={sourceViewerInitialRequestRowCount}
          lineOverscan={sourceViewerLineOverscan}
          overscanRequestDelayMs={sourceViewerOverscanRequestDelayMs}
          renderRow={renderLine}
          rowHeight={rowHeight}
          sourceRows={sourceRows}
          style={styles.list}
        />
      ) : state.status === "empty" ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            No code file open
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            Open a TypeScript or TSX file to view it.
          </Text>
        </View>
      ) : (
        null
      )}
    </View>
  );
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    minHeight: 60,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  list: {
    flex: 1,
  },
  openButton: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  root: {
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
});
