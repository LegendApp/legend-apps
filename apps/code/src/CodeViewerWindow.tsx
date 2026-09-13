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
import { computed, ObservableHint, type Observable, type OpaqueObject } from "@legendapp/state";
import { useObservable, useObserveEffect, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, type ComponentProps } from "react";
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
    resource: OpaqueObject<{ document: SyntaxDocument }>;
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
  const state$ = useObservable<CodeViewerState>(emptyState);
  const setState = state$.set;
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxTheme = useCodeSyntaxTheme();
  const launchFile = useMemo(() => getLaunchCodeFile(launchArguments), [launchArguments]);
  const loadedLaunchFileRef = useRef<string | null>(null);
  const loadedFileRequestVersionRef = useRef(0);
  const loadRequestVersion = useRef(0);
  useEffect(() => () => { loadRequestVersion.current++; }, []);

  const loadFile = useCallback(async (
    filePath: string,
    syntaxThemeName: CodeSettingsFile["syntaxTheme"],
    shouldHighlightSyntax: boolean,
  ) => {
    const requestVersion = ++loadRequestVersion.current;
    const loadStartedAt = nowMs();
    const initialHighlightLineCount = shouldHighlightSyntax ? codeInitialLineCount : 0;

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
        initialHighlightLineCount,
      );
      if (requestVersion !== loadRequestVersion.current) return;
      const loadFinishedAt = nowMs();
      const timing = toSourceDocumentTiming(highlighted.timing, loadFinishedAt - loadStartedAt);

      setState({
        status: "loaded",
        filePath,
        error: null,
        resource: ObservableHint.opaque({ document: highlighted.document }),
        initialLines: highlighted.initialLines,
        styles: highlighted.styles,
        syntaxTheme: syntaxThemeName,
        timing,
      });
      noteRecentDocument(filePath);
    } catch (error) {
      if (requestVersion !== loadRequestVersion.current) return;
      setState({
        status: "error",
        filePath,
        error: error instanceof Error ? error.message : String(error),
        timing: null,
      });
    }
  }, [setState]);

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
        filePath: state$.filePath.peek(),
        error: error instanceof Error ? error.message : String(error),
        timing: null,
      });
    }
  }, [loadFile, selectedSyntaxTheme, state$, syntaxHighlightingEnabled, setState]);

  useEffect(() => {
    if (launchFile && loadedLaunchFileRef.current !== launchFile) {
      loadedLaunchFileRef.current = launchFile;
      loadFile(launchFile, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [launchFile, loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled]);

  useObserveEffect(() => {
    const fileRequest = codeViewerFileRequest$.get();
    if (
      fileRequest.path &&
      loadedFileRequestVersionRef.current !== fileRequest.version
    ) {
      loadedFileRequestVersionRef.current = fileRequest.version;
      loadedLaunchFileRef.current = fileRequest.path;
      loadFile(fileRequest.path, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled]);

  useObserveEffect(() => {
    const state = state$.get();
    if (state.status === "loaded" && state.syntaxTheme !== selectedSyntaxTheme) {
      loadFile(state.filePath, selectedSyntaxTheme, syntaxHighlightingEnabled);
    }
  }, [loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled]);

  useObserveEffect(() => {
    setCodeViewerWindowOptions({
      appearance: syntaxTheme.appearance,
      backgroundColor: syntaxTheme.background,
      filePath: state$.filePath.get(),
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [syntaxTheme.appearance, syntaxTheme.background]);

  return <>
    <CodeDocumentWatcher state$={state$} loadFile={loadFile} selectedSyntaxTheme={selectedSyntaxTheme} syntaxHighlightingEnabled={syntaxHighlightingEnabled} />
    <CodeViewerContent state$={state$} launchFile={launchFile} openCodeDialog={openCodeDialog} />
  </>;
}

function CodeDocumentWatcher({ state$, loadFile, selectedSyntaxTheme, syntaxHighlightingEnabled }: {
  state$: Observable<CodeViewerState>;
  loadFile: (path: string, theme: CodeSettingsFile["syntaxTheme"], highlight: boolean) => Promise<void>;
  selectedSyntaxTheme: CodeSettingsFile["syntaxTheme"];
  syntaxHighlightingEnabled: boolean;
}) {
  const path = useValue(() => state$.status.get() === "loaded" ? state$.filePath.get() : null);
  const reloadLoadedFile = useCallback(() => {
    if (path) void loadFile(path, selectedSyntaxTheme, syntaxHighlightingEnabled);
  }, [loadFile, path, selectedSyntaxTheme, syntaxHighlightingEnabled]);
  useWatchedDocumentReload({ onReload: reloadLoadedFile, path });
  return null;
}

function CodeViewerContent({ state$, launchFile, openCodeDialog }: {
  state$: Observable<CodeViewerState>;
  launchFile: string | null;
  openCodeDialog: () => Promise<void>;
}) {
  const state = useValue(state$);
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxTheme = useCodeSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const documentSnapshot = useMemo<SourceDocumentSnapshot | null>(
    () => state.status === "loaded"
      ? {
          document: state.resource.document,
          initialRows: state.initialLines,
          itemCount: state.resource.document.lineCount,
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
  const currentDocument = state.status === "loaded" ? state.resource.document : null;
  const tokenStyleById$ = useMemo(() => computed(() => createSyntaxStyleMap(sourceRows.styles$.get())), [sourceRows.styles$]);
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

  const renderLine = useCallback(
    ({ index: lineIndex, row: line }: VirtualizedFixedDocumentListRenderRowProps<SyntaxRenderLine>) => {
      return (
        <ObservableSourceLineRow
          foregroundColor={foregroundColor}
          index={lineIndex}
          line={line}
          lineNumberStyle={lineNumberStyle}
          mutedColor={mutedColor}
          rowStyle={lineRowStyle}
          textStyle={lineTextStyle}
          tokenStyleById$={tokenStyleById$}
        />
      );
    },
    [foregroundColor, lineNumberStyle, lineRowStyle, lineTextStyle, mutedColor, tokenStyleById$],
  );

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {fileName}
          </Text>
          <CodeTimingSummary timing$={sourceRows.timing$} fallback={visibleFilePath ?? "Open a .ts or .tsx file"} mutedColor={mutedColor} />
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
      <View style={styles.list}>
        <SourceDocumentView
          dataKey={state.filePath ?? undefined}
          initialRequestRowCount={sourceViewerInitialRequestRowCount}
          lineOverscan={sourceViewerLineOverscan}
          overscanRequestDelayMs={sourceViewerOverscanRequestDelayMs}
          renderRow={renderLine}
          rowHeight={rowHeight}
          sourceRows={sourceRows}
          style={styles.list}
        />
        {state.status === "empty" ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
              No code file open
            </Text>
            <Text style={[styles.emptyText, { color: mutedColor }]}>
              Open a TypeScript or TSX file to view it.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function CodeTimingSummary({ timing$, fallback, mutedColor }: {
  timing$: Observable<SourceDocumentTiming | null>; fallback: string; mutedColor: string;
}) {
  const timing = useValue(timing$);
  return <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
    {timing ? formatTimingSummary(timing) : fallback}
  </Text>;
}

function ObservableSourceLineRow({ tokenStyleById$, ...props }: Omit<ComponentProps<typeof SourceLineRow>, "tokenStyleById"> & {
  tokenStyleById$: Observable<ReturnType<typeof createSyntaxStyleMap>>;
}) {
  const tokenStyleById = useValue(tokenStyleById$);
  return <SourceLineRow {...props} tokenStyleById={tokenStyleById} />;
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
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
