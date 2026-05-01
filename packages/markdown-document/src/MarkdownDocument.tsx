import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownTextInputStyle,
} from "react-native-enriched-markdown";
import { Linking, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type TextStyle } from "react-native";
import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
import { defaultMarkdownStyle } from "./styles";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentCommands,
  MarkdownDocumentProps,
  MarkdownDocumentSnapshot,
  MarkdownSaveState,
  MarkdownTransactionResult,
} from "./types";

type DocumentState =
  | {
      status: "loading";
      snapshot?: undefined;
      error?: undefined;
    }
  | {
      status: "loaded";
      snapshot: MarkdownDocumentSnapshot;
      error?: undefined;
    }
  | {
      status: "error";
      snapshot?: undefined;
      error: Error;
    };

type HistoryEntry = {
  type: "updateBlockMarkdown";
  blockId: string;
  beforeMarkdown: string;
  afterMarkdown: string;
};

const estimatedItemSize = 120;
const hydrateChunkSize = 512;
const editDebounceMs = 300;

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function inputStyleFromMarkdownStyle(markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>) {
  return {
    link: markdownStyle.link
      ? {
          color: markdownStyle.link.color,
          underline: markdownStyle.link.underline,
        }
      : undefined,
  } satisfies MarkdownTextInputStyle;
}

function editableTextStyleForBlock(
  block: MarkdownBlockSnapshot,
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>,
) {
  const headingLevel = block.markdown.match(/^(#{1,6})\s/)?.[1]?.length;
  const markdownTextStyle =
    headingLevel === 1
      ? markdownStyle.h1
      : headingLevel === 2
        ? markdownStyle.h2
        : headingLevel === 3
          ? markdownStyle.h3
          : block.type === "codeBlock"
            ? markdownStyle.codeBlock
            : markdownStyle.paragraph;

  return [styles.editorInput, markdownTextStyle as TextStyle | undefined];
}

function splitMarkdownAtFirstLineBreak(markdown: string) {
  const lineBreakIndex = markdown.indexOf("\n");
  if (lineBreakIndex < 0) {
    return null;
  }

  const beforeMarkdown = markdown.slice(0, lineBreakIndex);
  const afterMarkdown = markdown.slice(lineBreakIndex + 1);
  return { beforeMarkdown, afterMarkdown };
}

function estimateMarkdownSelection(markdown: string, event: GestureResponderEvent, width: number) {
  const lineHeight = 25;
  const averageCharacterWidth = 8;
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
  const lineHeight = 25;
  const averageCharacterWidth = 8;
  const charactersPerLine = Math.max(20, Math.floor(width / averageCharacterWidth));
  const visualLines = markdown
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(Math.max(1, line.length) / charactersPerLine)), 0);

  return Math.max(lineHeight, visualLines * lineHeight);
}

type ChangeMarkdownHandler = (block: MarkdownBlockSnapshot, markdown: string) => void;

const MarkdownEditorInput = memo(
  function MarkdownEditorInput({
    activeInputRef,
    block,
    initialMarkdown,
    initialSelection,
    markdownStyle,
    onBlurRef,
    onChangeMarkdownRef,
    rowWidth,
  }: {
    activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
    block: MarkdownBlockSnapshot;
    initialMarkdown: string;
    initialSelection: number;
    markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
    onBlurRef: RefObject<() => void>;
    onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
    rowWidth: number;
  }) {
    useEffect(() => {
      const timeout = setTimeout(() => {
        activeInputRef.current?.focus();
        activeInputRef.current?.setSelection(initialSelection, initialSelection);
      }, 0);

      return () => clearTimeout(timeout);
    }, [activeInputRef, initialSelection]);

    return (
      <EnrichedMarkdownTextInput
        ref={activeInputRef}
        autoFocus
        defaultValue={initialMarkdown}
        markdownStyle={inputStyleFromMarkdownStyle(markdownStyle)}
        multiline
        onBlur={() => onBlurRef.current()}
        onChangeMarkdown={(markdown) => onChangeMarkdownRef.current(block, markdown)}
        scrollEnabled={false}
        style={StyleSheet.flatten([
          editableTextStyleForBlock(block, markdownStyle),
          { minHeight: estimateMarkdownEditorHeight(initialMarkdown, rowWidth) },
        ])}
      />
    );
  },
  (previousProps, nextProps) =>
    previousProps.activeInputRef === nextProps.activeInputRef &&
    previousProps.block.id === nextProps.block.id &&
    previousProps.initialMarkdown === nextProps.initialMarkdown &&
    previousProps.initialSelection === nextProps.initialSelection &&
    previousProps.markdownStyle === nextProps.markdownStyle &&
    previousProps.onBlurRef === nextProps.onBlurRef &&
    previousProps.onChangeMarkdownRef === nextProps.onChangeMarkdownRef &&
    previousProps.rowWidth === nextProps.rowWidth,
);

function MarkdownBlockRow({
  activeInputRef,
  draftMarkdown,
  initialSelection,
  isActive,
  onActivate,
  onBlurRef,
  onChangeMarkdownRef,
  block,
  markdownStyle,
}: LegendListRenderItemProps<string> & {
  activeInputRef: RefObject<EnrichedMarkdownTextInputInstance | null>;
  block?: MarkdownBlockSnapshot;
  draftMarkdown: string;
  initialSelection: number;
  isActive: boolean;
  markdownStyle: NonNullable<MarkdownDocumentProps["markdownStyle"]>;
  onActivate: (block: MarkdownBlockSnapshot, selection: number) => void;
  onBlurRef: RefObject<() => void>;
  onChangeMarkdownRef: RefObject<ChangeMarkdownHandler>;
}) {
  const [rowWidth, setRowWidth] = useState(700);

  if (!block) {
    return null;
  }

  if (isActive) {
    return (
      <View style={styles.blockRow}>
        <MarkdownEditorInput
          activeInputRef={activeInputRef}
          block={block}
          initialMarkdown={draftMarkdown}
          initialSelection={initialSelection}
          markdownStyle={markdownStyle}
          onBlurRef={onBlurRef}
          onChangeMarkdownRef={onChangeMarkdownRef}
          rowWidth={rowWidth}
        />
      </View>
    );
  }

  return (
    <Pressable
      onLayout={(event) => {
        setRowWidth(event.nativeEvent.layout.width);
      }}
      onPress={(event) => {
        onActivate(block, estimateMarkdownSelection(block.markdown, event, rowWidth));
      }}
      style={styles.blockRow}
    >
      <EnrichedMarkdownText
        allowTrailingMargin={false}
        containerStyle={styles.renderedText}
        flavor="github"
        markdown={block.markdown}
        markdownStyle={markdownStyle}
        onLinkPress={(event) => {
          void Linking.openURL(event.url);
        }}
        selectable
      />
    </Pressable>
  );
}

export const MarkdownDocument = forwardRef<MarkdownDocumentCommands, MarkdownDocumentProps>(
  (
    {
      adapter = nativeMarkdownDocumentAdapter,
      autoFocusFirstBlock,
      commandsRef,
      contentContainerStyle,
      filename,
      markdownStyle,
      onDirtyChange,
      onError,
      onLoaded,
      onSaveStateChange,
      savePolicy,
      style,
      theme,
    },
    ref,
  ) => {
    const loadVersionRef = useRef(0);
    const hydrateFrameRef = useRef<number | undefined>(undefined);
    const activeInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
    const editTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const saveRef = useRef<(() => void) | undefined>(undefined);
    const activeBlockIdRef = useRef<string | null>(null);
    const draftMarkdownRef = useRef("");
    const committedMarkdownRef = useRef("");
    const currentRevisionRef = useRef(0);
    const savedRevisionRef = useRef(0);
    const isDirtyRef = useRef(false);
    const pendingRenderTransactionRef = useRef<MarkdownTransactionResult | undefined>(undefined);
    const autosavePausedRef = useRef(false);
    const undoStackRef = useRef<HistoryEntry[]>([]);
    const redoStackRef = useRef<HistoryEntry[]>([]);
    const suppressHistoryRef = useRef(false);
    const [blockIds, setBlockIds] = useState<string[]>([]);
    const [blocksById, setBlocksById] = useState(() => new Map<string, MarkdownBlockSnapshot>());
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [activeSelection, setActiveSelection] = useState(0);
    const [draftMarkdown, setDraftMarkdown] = useState("");
    const [documentState, setDocumentState] = useState<DocumentState>({ status: "loading" });
    const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
    const onDirtyChangeRef = useLatestRef(onDirtyChange);
    const onErrorRef = useLatestRef(onError);
    const onLoadedRef = useLatestRef(onLoaded);
    const onSaveStateChangeRef = useLatestRef(onSaveStateChange);

    const clearEditTimer = useCallback(() => {
      if (editTimerRef.current !== undefined) {
        clearTimeout(editTimerRef.current);
        editTimerRef.current = undefined;
      }
    }, []);

    const clearAutosaveTimer = useCallback(() => {
      if (autosaveTimerRef.current !== undefined) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
    }, []);

    const autosaveEnabled = savePolicy?.autosave ?? true;
    const autosaveDebounceMs = Math.min(Math.max(savePolicy?.debounceMs ?? 2000, 0), 2000);

    const scheduleAutosave = useCallback(() => {
      clearAutosaveTimer();
      if (!autosaveEnabled || autosavePausedRef.current) {
        return;
      }

      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = undefined;
        saveRef.current?.();
      }, autosaveDebounceMs);
    }, [autosaveDebounceMs, autosaveEnabled, clearAutosaveTimer]);

    const markDirty = useCallback(() => {
      autosavePausedRef.current = false;
      if (!isDirtyRef.current) {
        isDirtyRef.current = true;
        onDirtyChangeRef.current?.(true);
      }
      scheduleAutosave();
    }, [onDirtyChangeRef, scheduleAutosave]);

    const setNextSaveState = useCallback(
      (nextSaveState: MarkdownSaveState) => {
        setSaveState(nextSaveState);
        onSaveStateChangeRef.current?.(nextSaveState);
      },
      [onSaveStateChangeRef],
    );

    const cancelHydration = useCallback(() => {
      if (hydrateFrameRef.current !== undefined) {
        cancelAnimationFrame(hydrateFrameRef.current);
        hydrateFrameRef.current = undefined;
      }
    }, []);

    const mergeBlocks = useCallback((blocks: MarkdownBlockSnapshot[]) => {
      if (blocks.length === 0) {
        return;
      }

      setBlocksById((previousBlocksById) => {
        const nextBlocksById = new Map(previousBlocksById);
        for (const block of blocks) {
          nextBlocksById.set(block.id, block);
        }
        return nextBlocksById;
      });

      setBlockIds((previousBlockIds) => {
        const seen = new Set(previousBlockIds);
        const nextBlockIds = [...previousBlockIds];
        for (const block of blocks) {
          if (!seen.has(block.id)) {
            seen.add(block.id);
            nextBlockIds.push(block.id);
          }
        }
        return nextBlockIds;
      });
    }, []);

    const applyTransactionResult = useCallback((result: MarkdownTransactionResult) => {
      currentRevisionRef.current = result.revision;
      setBlocksById((previousBlocksById) => {
        const nextBlocksById = new Map(previousBlocksById);
        for (const retiredBlockId of result.retiredBlockIds) {
          nextBlocksById.delete(retiredBlockId);
        }
        for (const block of result.changedBlocks) {
          nextBlocksById.set(block.id, block);
        }
        return nextBlocksById;
      });

      setBlockIds((previousBlockIds) => {
        const nextBlockIds = [...previousBlockIds];
        nextBlockIds.splice(
          result.changedRange.startBlockIndex,
          result.changedRange.deleteCount,
          ...result.changedRange.blockIds,
        );
        return nextBlockIds;
      });

      setDocumentState((previousDocumentState) => {
        if (previousDocumentState.status !== "loaded") {
          return previousDocumentState;
        }

        return {
          status: "loaded",
          snapshot: {
            ...previousDocumentState.snapshot,
            blockCount:
              previousDocumentState.snapshot.blockCount -
              result.changedRange.deleteCount +
              result.changedRange.blockIds.length,
            sourceSize: result.sourceLength,
          },
        };
      });
    }, []);

    const commitActiveBlock = useCallback(async (options: { updateReactState?: boolean } = {}) => {
      clearEditTimer();

      const updateReactState = options.updateReactState ?? true;
      const activeBlockIdValue = activeBlockIdRef.current;
      const markdown = draftMarkdownRef.current;
      if (
        documentState.status !== "loaded" ||
        !adapter.applyTransaction ||
        !activeBlockIdValue ||
        markdown === committedMarkdownRef.current
      ) {
        if (updateReactState && pendingRenderTransactionRef.current) {
          applyTransactionResult(pendingRenderTransactionRef.current);
          pendingRenderTransactionRef.current = undefined;
        }
        return;
      }

      try {
        const beforeMarkdown = committedMarkdownRef.current;
        const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
          type: "updateBlockMarkdown",
          blockId: activeBlockIdValue,
          markdown,
        });
        if (!suppressHistoryRef.current) {
          undoStackRef.current.push({
            type: "updateBlockMarkdown",
            blockId: activeBlockIdValue,
            beforeMarkdown,
            afterMarkdown: markdown,
          });
          redoStackRef.current = [];
        }
        if (activeBlockIdRef.current === activeBlockIdValue) {
          committedMarkdownRef.current = markdown;
        }
        if (updateReactState) {
          applyTransactionResult(result);
          pendingRenderTransactionRef.current = undefined;
        } else {
          currentRevisionRef.current = result.revision;
          pendingRenderTransactionRef.current = result;
        }
      } catch (error) {
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      }
    }, [adapter, applyTransactionResult, clearEditTimer, documentState, onErrorRef]);

    const activateBlock = useCallback(
      (block: MarkdownBlockSnapshot, selection: number) => {
        void commitActiveBlock({ updateReactState: true });
        activeBlockIdRef.current = block.id;
        draftMarkdownRef.current = block.markdown;
        committedMarkdownRef.current = block.markdown;
        setDraftMarkdown(block.markdown);
        setActiveSelection(selection);
        setActiveBlockId(block.id);
      },
      [commitActiveBlock],
    );

    const splitActiveBlock = useCallback(
      async (block: MarkdownBlockSnapshot, beforeMarkdown: string, afterMarkdown: string) => {
        clearEditTimer();

        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return;
        }

        try {
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "splitBlock",
            blockId: block.id,
            beforeMarkdown,
            afterMarkdown,
          });
          applyTransactionResult(result);

          const nextActiveBlockId = result.changedRange.blockIds[1] ?? result.changedRange.blockIds[0] ?? block.id;
          activeBlockIdRef.current = nextActiveBlockId;
          draftMarkdownRef.current = afterMarkdown;
          committedMarkdownRef.current = afterMarkdown;
          setDraftMarkdown(afterMarkdown);
          setActiveBlockId(nextActiveBlockId);
          markDirty();
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [adapter, applyTransactionResult, clearEditTimer, documentState, markDirty, onErrorRef],
    );

    const handleChangeMarkdown = useCallback(
      (block: MarkdownBlockSnapshot, markdown: string) => {
        if (block.type !== "codeBlock") {
          const splitMarkdown = splitMarkdownAtFirstLineBreak(markdown);
          if (splitMarkdown) {
            void splitActiveBlock(block, splitMarkdown.beforeMarkdown, splitMarkdown.afterMarkdown);
            return;
          }
        }

        draftMarkdownRef.current = markdown;
        markDirty();
        clearEditTimer();
        editTimerRef.current = setTimeout(() => {
          void commitActiveBlock({ updateReactState: false });
        }, editDebounceMs);
      },
      [clearEditTimer, commitActiveBlock, markDirty, splitActiveBlock],
    );
    const handleChangeMarkdownRef = useLatestRef(handleChangeMarkdown);

    const handleEditorBlur = useCallback(() => {
      void commitActiveBlock({ updateReactState: true });
      activeBlockIdRef.current = null;
      setActiveBlockId(null);
      setActiveSelection(0);
    }, [commitActiveBlock]);
    const handleEditorBlurRef = useLatestRef(handleEditorBlur);

    const hydrateRemainingBlocks = useCallback(
      (snapshot: MarkdownDocumentSnapshot, loadVersion: number) => {
        cancelHydration();

        let startIndex = snapshot.initialBlocks.length;
        const hydrateNextChunk = () => {
          hydrateFrameRef.current = undefined;
          if (loadVersion !== loadVersionRef.current || startIndex >= snapshot.blockCount) {
            return;
          }

          const count = Math.min(hydrateChunkSize, snapshot.blockCount - startIndex);
          void adapter
            .getBlocks(snapshot.documentId, startIndex, count)
            .then((blocks) => {
              if (loadVersion !== loadVersionRef.current) {
                return;
              }

              mergeBlocks(blocks);
              startIndex += blocks.length;

              if (blocks.length > 0 && startIndex < snapshot.blockCount) {
                hydrateFrameRef.current = requestAnimationFrame(hydrateNextChunk);
              }
            })
            .catch((error: unknown) => {
              if (loadVersion !== loadVersionRef.current) {
                return;
              }

              const nextError = error instanceof Error ? error : new Error(String(error));
              setDocumentState({ status: "error", error: nextError });
              onErrorRef.current?.(nextError);
            });
        };

        if (startIndex < snapshot.blockCount) {
          hydrateFrameRef.current = requestAnimationFrame(hydrateNextChunk);
        }
      },
      [adapter, cancelHydration, mergeBlocks, onErrorRef],
    );

    useEffect(() => {
      loadVersionRef.current += 1;
      const loadVersion = loadVersionRef.current;
      let isCanceled = false;

      cancelHydration();
      clearEditTimer();
      clearAutosaveTimer();
      activeBlockIdRef.current = null;
      draftMarkdownRef.current = "";
      committedMarkdownRef.current = "";
      currentRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      isDirtyRef.current = false;
      pendingRenderTransactionRef.current = undefined;
      autosavePausedRef.current = false;
      undoStackRef.current = [];
      redoStackRef.current = [];
      suppressHistoryRef.current = false;
      setDocumentState({ status: "loading" });
      setBlockIds([]);
      setBlocksById(new Map());
      setActiveBlockId(null);
      setActiveSelection(0);
      setDraftMarkdown("");
      setNextSaveState("idle");
      onDirtyChangeRef.current?.(false);

      void adapter
        .load(filename)
        .then((snapshot) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            void adapter.close(snapshot.documentId);
            return;
          }

          const nextBlocksById = new Map<string, MarkdownBlockSnapshot>();
          for (const block of snapshot.initialBlocks) {
            nextBlocksById.set(block.id, block);
          }

          setBlocksById(nextBlocksById);
          setBlockIds(snapshot.initialBlocks.map((block) => block.id));
          setDocumentState({ status: "loaded", snapshot });
          if (autoFocusFirstBlock) {
            const firstBlock = snapshot.initialBlocks[0];
            if (firstBlock) {
              activeBlockIdRef.current = firstBlock.id;
              draftMarkdownRef.current = firstBlock.markdown;
              committedMarkdownRef.current = firstBlock.markdown;
              setDraftMarkdown(firstBlock.markdown);
              setActiveSelection(0);
              setActiveBlockId(firstBlock.id);
            }
          }
          onLoadedRef.current?.({
            documentId: snapshot.documentId,
            filename: snapshot.filename,
            blockCount: snapshot.blockCount,
            sourceSize: snapshot.sourceSize,
          });
        })
        .catch((error: unknown) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            return;
          }

          const nextError = error instanceof Error ? error : new Error(String(error));
          setDocumentState({ status: "error", error: nextError });
          onErrorRef.current?.(nextError);
        });

      return () => {
        isCanceled = true;
        cancelHydration();
        clearEditTimer();
        clearAutosaveTimer();
      };
    }, [
      adapter,
      cancelHydration,
      clearAutosaveTimer,
      clearEditTimer,
      autoFocusFirstBlock,
      filename,
      onDirtyChangeRef,
      onErrorRef,
      onLoadedRef,
      setNextSaveState,
    ]);

    const loadedDocumentId = documentState.status === "loaded" ? documentState.snapshot.documentId : undefined;
    useEffect(() => {
      if (!loadedDocumentId) {
        return undefined;
      }

      return () => {
        void adapter.close(loadedDocumentId);
      };
    }, [adapter, loadedDocumentId]);

    const save = useCallback(() => {
      if (documentState.status !== "loaded" || saveState === "saving") {
        return;
      }

      clearAutosaveTimer();
      autosavePausedRef.current = false;
      setNextSaveState("saving");
      void (async () => {
        try {
          await commitActiveBlock({ updateReactState: false });
          await adapter.save(documentState.snapshot.documentId);
          savedRevisionRef.current = currentRevisionRef.current;
          setNextSaveState("idle");
          isDirtyRef.current = currentRevisionRef.current !== savedRevisionRef.current;
          onDirtyChangeRef.current?.(isDirtyRef.current);
        } catch (error: unknown) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          autosavePausedRef.current = true;
          setNextSaveState("error");
          onErrorRef.current?.(nextError);
        }
      })();
    }, [
      adapter,
      clearAutosaveTimer,
      commitActiveBlock,
      documentState,
      onDirtyChangeRef,
      onErrorRef,
      saveState,
      setNextSaveState,
    ]);

    useEffect(() => {
      saveRef.current = save;
      return () => {
        if (saveRef.current === save) {
          saveRef.current = undefined;
        }
      };
    }, [save]);

    const applyHistoryEntry = useCallback(
      async (entry: HistoryEntry, markdown: string) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return false;
        }

        suppressHistoryRef.current = true;
        try {
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "updateBlockMarkdown",
            blockId: entry.blockId,
            markdown,
          });
          applyTransactionResult(result);
          if (activeBlockIdRef.current === entry.blockId) {
            draftMarkdownRef.current = markdown;
            committedMarkdownRef.current = markdown;
            setDraftMarkdown(markdown);
            activeInputRef.current?.setValue(markdown);
          }
          markDirty();
          return true;
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
          return false;
        } finally {
          suppressHistoryRef.current = false;
        }
      },
      [adapter, applyTransactionResult, documentState, markDirty, onErrorRef],
    );

    const undo = useCallback(() => {
      void (async () => {
        await commitActiveBlock({ updateReactState: true });
        const entry = undoStackRef.current.pop();
        if (!entry) {
          return;
        }

        if (await applyHistoryEntry(entry, entry.beforeMarkdown)) {
          redoStackRef.current.push(entry);
        } else {
          undoStackRef.current.push(entry);
        }
      })();
    }, [applyHistoryEntry, commitActiveBlock]);

    const redo = useCallback(() => {
      void (async () => {
        await commitActiveBlock({ updateReactState: true });
        const entry = redoStackRef.current.pop();
        if (!entry) {
          return;
        }

        if (await applyHistoryEntry(entry, entry.afterMarkdown)) {
          undoStackRef.current.push(entry);
        } else {
          redoStackRef.current.push(entry);
        }
      })();
    }, [applyHistoryEntry, commitActiveBlock]);

    const commands = useMemo<MarkdownDocumentCommands>(
      () => ({
        focus() {
          activeInputRef.current?.focus();
        },
        insertLink() {
          activeInputRef.current?.insertLink("link", "https://");
        },
        redo,
        save,
        toggleBold() {
          activeInputRef.current?.toggleBold();
        },
        toggleItalic() {
          activeInputRef.current?.toggleItalic();
        },
        toggleSpoiler() {
          activeInputRef.current?.toggleSpoiler();
        },
        toggleStrikethrough() {
          activeInputRef.current?.toggleStrikethrough();
        },
        toggleUnderline() {
          activeInputRef.current?.toggleUnderline();
        },
        undo,
      }),
      [redo, save, undo],
    );

    useImperativeHandle(ref, () => commands, [commands]);
    useImperativeHandle(commandsRef, () => commands, [commands]);

    const resolvedMarkdownStyle = markdownStyle ?? defaultMarkdownStyle;
    const listExtraData = useMemo(
      () => ({
        activeBlockId,
        activeSelection,
        blocksById,
      }),
      [activeBlockId, activeSelection, blocksById],
    );
    const contentStyle = useMemo(
      () => [styles.contentContainer, contentContainerStyle],
      [contentContainerStyle],
    );

    if (documentState.status === "error") {
      return (
        <View style={[styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
          <Text style={[styles.errorText, theme?.errorColor ? { color: theme.errorColor } : null]}>
            {documentState.error.message}
          </Text>
        </View>
      );
    }

    if (documentState.status === "loading") {
      return (
        <View style={[styles.container, styles.centered, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
          <Text style={[styles.statusText, theme?.mutedForegroundColor ? { color: theme.mutedForegroundColor } : null]}>
            Loading document...
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style]}>
        <LegendList
          contentContainerStyle={contentStyle}
          data={blockIds}
          estimatedItemSize={estimatedItemSize}
          extraData={listExtraData}
          keyExtractor={(item) => item}
          onLoad={() => {
            hydrateRemainingBlocks(documentState.snapshot, loadVersionRef.current);
          }}
          recycleItems
          renderItem={(props) => (
            <MarkdownBlockRow
              {...props}
              activeInputRef={activeInputRef}
              block={blocksById.get(props.item)}
              draftMarkdown={activeBlockId === props.item ? draftMarkdown : ""}
              initialSelection={activeSelection}
              isActive={activeBlockId === props.item}
              markdownStyle={resolvedMarkdownStyle}
              onActivate={activateBlock}
              onBlurRef={handleEditorBlurRef}
              onChangeMarkdownRef={handleChangeMarkdownRef}
            />
          )}
          style={styles.list}
        />
      </View>
    );
  },
);

MarkdownDocument.displayName = "MarkdownDocument";

const styles = StyleSheet.create({
  blockRow: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    backgroundColor: "#f5f6f8",
    flex: 1,
  },
  contentContainer: {
    alignSelf: "center",
    maxWidth: 920,
    paddingHorizontal: 40,
    paddingVertical: 48,
    width: "100%",
  },
  errorText: {
    color: "#b42318",
    fontSize: 14,
    padding: 32,
    textAlign: "center",
  },
  editorInput: {
    backgroundColor: "transparent",
    color: "#374151",
    fontSize: 16,
    lineHeight: 25,
    minHeight: 25,
    padding: 0,
    width: "100%",
  },
  list: {
    flex: 1,
  },
  renderedText: {
    width: "100%",
  },
  statusText: {
    color: "#6b7280",
    fontSize: 14,
  },
});
