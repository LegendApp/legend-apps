import { openFileDialog } from "@legend-desktop/file-dialog";
import { noteRecentDocument } from "@legend-desktop/recent-documents";
import {
  loadCodeFile,
  type SyntaxDocument,
  type SyntaxRenderLine,
  type SyntaxStyle,
} from "@legend-desktop/syntax-parser";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { codeFileTypes } from "./appConstants";
import { getCodeLanguage, getFilename, getLaunchCodeFile, isCodePath } from "./codeFiles";
import { setCodeViewerWindowOptions } from "./codeWindows";

type CodeViewerWindowProps = {
  launchArguments?: string[];
};

const rowHeight = 22;
const initialLineCount = 360;
const lineOverscan = 160;

type CodeViewerState =
  | {
    status: "empty";
    filePath: null;
    error: null;
  }
  | {
    status: "loading";
    filePath: string;
    error: null;
    timing: null;
  }
  | {
    status: "loaded";
    filePath: string;
    error: null;
    document: SyntaxDocument;
    lineCount: number;
    lineCache: Map<number, SyntaxRenderLine>;
    refreshKey: number;
    styles: SyntaxStyle[];
    timing: {
      lineCount: number;
      tokenCount: number;
      tokenizeMs: number;
    };
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

function createStyleMap(styles: SyntaxStyle[]) {
  return new Map(styles.map((style) => [style.id, style]));
}

function formatLineCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "line" : "lines"}`;
}

function createLineCache(lines: SyntaxRenderLine[]) {
  const cache = new Map<number, SyntaxRenderLine>();
  for (const line of lines) {
    cache.set(line.index, line);
  }
  return cache;
}

export function CodeViewerWindow({ launchArguments }: CodeViewerWindowProps) {
  const displayTheme = getLegendDisplayTheme("dark");
  const [state, setState] = useState<CodeViewerState>(emptyState);
  const stateRef = useRef<CodeViewerState>(emptyState);
  const stylesForState = state.status === "loaded" ? state.styles : [];
  const tokenStyleById = useMemo(() => createStyleMap(stylesForState), [stylesForState]);
  const lineCache = state.status === "loaded" ? state.lineCache : null;
  const lineCount = state.status === "loaded" ? state.lineCount : 0;
  const lineIndexes = useMemo(() => Array.from({ length: lineCount }, (_, index) => index), [lineCount]);
  const fileName = state.filePath ? getFilename(state.filePath) : "No file";
  const backgroundColor = displayTheme.colors.background;
  const mutedColor = displayTheme.colors.muted;
  const foregroundColor = displayTheme.colors.foreground;
  const borderColor = displayTheme.colors.border;

  const loadFile = useCallback(async (filePath: string) => {
    setState({
      status: "loading",
      filePath,
      error: null,
      timing: null,
    });

    try {
      const highlighted = await loadCodeFile(filePath, getCodeLanguage(filePath), "github-dark", initialLineCount);
      setState({
        status: "loaded",
        filePath,
        error: null,
        document: highlighted.document,
        lineCount: highlighted.document.lineCount,
        lineCache: createLineCache(highlighted.initialLines),
        refreshKey: 0,
        styles: highlighted.styles,
        timing: {
          lineCount: highlighted.timing.lineCount,
          tokenCount: highlighted.timing.tokenCount,
          tokenizeMs: highlighted.timing.tokenizeMs,
        },
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

  const requestLineRange = useCallback((start: number, count: number) => {
    const loadedState = stateRef.current;
    if (loadedState.status === "loaded") {
      const safeStart = Math.max(0, Math.floor(start));
      const safeEnd = Math.min(loadedState.lineCount, safeStart + Math.max(0, Math.ceil(count)));

      if (safeStart < safeEnd) {
        let hasMissingLine = false;
        for (let index = safeStart; index < safeEnd; index += 1) {
          if (!loadedState.lineCache.has(index)) {
            hasMissingLine = true;
            break;
          }
        }

        if (hasMissingLine) {
          const fetchedLines = loadedState.document.getRenderLines(safeStart, safeEnd - safeStart);
          const styles = loadedState.document.getStyles();
          const timing = loadedState.document.getTiming();

          setState((currentState) => {
            if (currentState.status !== "loaded" || currentState.document !== loadedState.document) {
              return currentState;
            }

            const nextLineCache = new Map(currentState.lineCache);
            for (const line of fetchedLines) {
              nextLineCache.set(line.index, line);
            }

            return {
              ...currentState,
              lineCache: nextLineCache,
              refreshKey: currentState.refreshKey + 1,
              styles,
              timing: {
                lineCount: timing.lineCount,
                tokenCount: timing.tokenCount,
                tokenizeMs: timing.tokenizeMs,
              },
            };
          });
        }
      }
    }
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const start = Math.floor(contentOffset.y / rowHeight) - lineOverscan;
    const count = Math.ceil(layoutMeasurement.height / rowHeight) + lineOverscan * 2;
    requestLineRange(start, count);
  }, [requestLineRange]);

  const openCodeDialog = useCallback(async () => {
    const paths = await openFileDialog({
      allowedFileTypes: codeFileTypes,
      canChooseFiles: true,
    });
    const path = paths?.find(isCodePath) ?? null;

    if (path) {
      await loadFile(path);
    } else if (paths && paths.length > 0) {
      setState({
        status: "error",
        filePath: state.filePath,
        error: `Choose a TypeScript file (${codeFileTypes.map((type) => `.${type}`).join(", ")}).`,
        timing: null,
      });
    }
  }, [loadFile, state.filePath]);

  const renderLine = useCallback(
    ({ item: lineIndex }: LegendListRenderItemProps<number>) => {
      const line = lineCache?.get(lineIndex);
      return (
        <View style={styles.lineRow}>
          <Text selectable={false} style={[styles.lineNumber, { color: mutedColor }]}>
            {lineIndex + 1}
          </Text>
          <Text numberOfLines={1} selectable style={[styles.codeLine, { color: foregroundColor }]}>
            {line?.tokens.map((token, tokenIndex) => {
              const tokenStyle = tokenStyleById.get(token.styleId);
              const text = line.text.slice(token.startColumn, token.startColumn + token.length);
              return (
                <Text
                  key={`${line.index}:${token.startColumn}:${tokenIndex}`}
                  style={{
                    color: tokenStyle?.foreground || foregroundColor,
                    fontStyle: tokenStyle?.fontStyle === 1 || tokenStyle?.fontStyle === 3 ? "italic" : "normal",
                    fontWeight: tokenStyle?.fontStyle === 2 || tokenStyle?.fontStyle === 3 ? "700" : "400",
                  }}
                >
                  {text}
                </Text>
              );
            })}
          </Text>
        </View>
      );
    },
    [foregroundColor, lineCache, mutedColor, tokenStyleById],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const launchFile = getLaunchCodeFile(launchArguments);
    if (launchFile) {
      loadFile(launchFile);
    }
  }, [launchArguments, loadFile]);

  useEffect(() => {
    setCodeViewerWindowOptions({
      backgroundColor: displayTheme.colors.windowBackground,
      filePath: state.filePath,
    }).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
    });
  }, [displayTheme.colors.windowBackground, state.filePath]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: foregroundColor }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]} numberOfLines={1}>
            {state.status === "loaded" && state.timing
              ? `${formatLineCount(state.timing.lineCount)} · ${state.timing.tokenCount.toLocaleString()} tokens · ${state.timing.tokenizeMs.toFixed(1)} ms`
              : state.status === "loading"
                ? "Loading..."
                : state.filePath ?? "Open a .ts or .tsx file"}
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
      {lineIndexes.length > 0 ? (
        <LegendList
          data={lineIndexes}
          extraData={state.status === "loaded" ? state.refreshKey : 0}
          getFixedItemSize={() => rowHeight}
          keyExtractor={(lineIndex) => String(lineIndex)}
          onScroll={handleScroll}
          recycleItems
          renderItem={renderLine}
          style={styles.list}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: foregroundColor }]}>
            {state.status === "loading" ? "Loading file" : "No code file open"}
          </Text>
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            {state.status === "loading" ? state.filePath : "Open a TypeScript or TSX file to view it."}
          </Text>
        </View>
      )}
    </View>
  );
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  codeLine: {
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 13,
    lineHeight: 22,
    overflow: "hidden",
  },
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
  lineNumber: {
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 22,
    paddingRight: 16,
    textAlign: "right",
    width: 72,
  },
  lineRow: {
    flexDirection: "row",
    height: 22,
    paddingHorizontal: 12,
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
