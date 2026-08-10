import {
  LegendList,
  type LegendListDataSourceRenderItemProps,
  type LegendListRef,
} from "@legendapp/list/react-native";
import { batch, type Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { MarkdownEditorHost } from "@legend-apps/markdown-block-editor";
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import {
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
import { findBlockIdAtContentY, getBlockSelectionRects } from "./blockSelection";
import { MarkdownBlockDataSource } from "./MarkdownBlockDataSource";
import { MarkdownBlockRow } from "./MarkdownBlockRow";
import { markdownDocumentStyles as styles } from "./MarkdownDocument.styles";
import { contentHorizontalPadding, contentMaxWidth, estimatedItemSize, hydrateChunkSize, usesNativeEditorOverlay } from "./constants";
import type {
  ActiveBlockRenderState,
  BlockLayout,
  BlockSelectionState,
  DocumentState,
  HistoryEntry,
  MarkdownDocumentRenderState,
  OverlayFrame,
  SelectionDragOutsideEvent,
  UpdateBlockHistoryEntry,
  VerticalNavigationOutsideEvent,
} from "./internalTypes";
import {
  blockRowSpacingStyle,
  estimateMarkdownEditorHeight,
  resolveSelectionColor,
  splitMarkdownAtFirstLineBreak,
} from "./markdownLayout";
import { resolveTextSelectionAnchor } from "./selectionAnchor";
import {
  getSplitContinuationMarkdown,
  setHeadingMarkdown,
  setParagraphMarkdown,
  thematicBreakMarkdown,
  toggleBlockquoteMarkdown,
  toggleCodeBlockMarkdown,
  toggleOrderedListMarkdown,
  toggleTaskListMarkdown,
  toggleUnorderedListMarkdown,
  type HeadingLevel,
} from "./markdownFormatting";
import { resolveOptimisticBlockPresentation } from "./optimisticBlockPresentation";
import { defaultMarkdownLayout, defaultMarkdownStyle } from "./styles";
import type {
  MarkdownBlockMetadata,
  MarkdownBlockSnapshot,
  MarkdownDocumentCommandState,
  MarkdownDocumentCommands,
  MarkdownDocumentProps,
  MarkdownSelectionAnchor,
  MarkdownDocumentSnapshot,
  MarkdownSaveState,
  MarkdownTransactionResult,
} from "./types";
import { useLatestRef } from "./useLatestRef";

const typingHistoryGroupTimeoutMs = 1000;
const markdownLineBreakPattern = /\r\n|\r|\n/g;
const markdownListLinePattern = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;
const markdownFenceStartPattern = /^\s*(?:```|~~~)/;

type FocusAdjacentBlockRequest = {
  direction: "up" | "down";
  preferredX?: number;
};

type PendingVerticalNavigationSelection = {
  blockId: string;
  direction: "up" | "down";
  preferredX: number;
};

type MarkdownSelectionToolbarFooterProps = {
  anchorPublisherProps: MarkdownBlockSelectionAnchorPublisherProps;
  enabled: boolean;
  renderSelectionToolbar?: (anchor: MarkdownSelectionAnchor) => ReactNode;
  selectionAnchor$: Observable<MarkdownSelectionAnchor | null>;
};

function createMarkdownDocumentRenderState(): MarkdownDocumentRenderState {
  return {
    activeBlocksById: new Map(),
    blockSelection: null,
    rowStatesById: new Map(),
    selectedBlocksById: new Map(),
  };
}

const MarkdownSelectionToolbarFooter = memo(function MarkdownSelectionToolbarFooter({
  anchorPublisherProps,
  enabled,
  renderSelectionToolbar,
  selectionAnchor$,
}: MarkdownSelectionToolbarFooterProps) {
  const anchor = useValue(selectionAnchor$);

  return (
    <View pointerEvents="box-none" style={styles.selectionToolbarFooterContent}>
      <MarkdownBlockSelectionAnchorPublisher {...anchorPublisherProps} />
      {enabled && anchor && renderSelectionToolbar ? renderSelectionToolbar(anchor) : null}
    </View>
  );
});

type MarkdownBlockSelectionAnchorPublisherProps = {
  dataRevision: number;
  enabled: boolean;
  documentRenderState$: Observable<MarkdownDocumentRenderState>;
  getBlockIdAtIndex: (index: number) => string | undefined;
  getBlockIndexById: (blockId: string) => number;
  inactiveOverlayWidth$: Observable<number>;
  listRef: RefObject<LegendListRef | null>;
  onSelectionAnchorChangeRef: RefObject<((anchor: MarkdownSelectionAnchor | null) => void) | undefined>;
  resolvedContentHorizontalPadding: number;
  resolvedContentVerticalPadding: number;
  selectionAnchor$: Observable<MarkdownSelectionAnchor | null>;
};

const MarkdownBlockSelectionAnchorPublisher = memo(function MarkdownBlockSelectionAnchorPublisher({
  dataRevision,
  enabled,
  documentRenderState$,
  getBlockIdAtIndex,
  getBlockIndexById,
  inactiveOverlayWidth$,
  listRef,
  onSelectionAnchorChangeRef,
  resolvedContentHorizontalPadding,
  resolvedContentVerticalPadding,
  selectionAnchor$,
}: MarkdownBlockSelectionAnchorPublisherProps) {
  const blockSelection = useValue(documentRenderState$.blockSelection);
  const inactiveOverlayWidth = useValue(inactiveOverlayWidth$);

  useEffect(() => {
    if (enabled) {
      let blockSelectionAnchor: MarkdownSelectionAnchor | null = null;
      if (blockSelection) {
        const listState = listRef.current?.getState();
        const blockSelectionRects = getBlockSelectionRects({
          blockSelection,
          getBlockIdAtIndex,
          getBlockIndexById,
          getBlockLayout: (_blockId, index) => getBlockLayoutFromListState(listState, index),
        });
        if (blockSelectionRects.length > 0) {
          const firstRect = blockSelectionRects.reduce((closestRect, rect) => (
            rect.y < closestRect.y ? rect : closestRect
          ), blockSelectionRects[0]);
          if (firstRect) {
            blockSelectionAnchor = {
              blockId: firstRect.blockId,
              height: firstRect.height,
              itemHeight: firstRect.height,
              itemWidth: inactiveOverlayWidth,
              itemX: resolvedContentHorizontalPadding,
              itemY: firstRect.y + resolvedContentVerticalPadding,
              kind: "blockSelection",
              width: inactiveOverlayWidth,
              x: resolvedContentHorizontalPadding,
              y: firstRect.y + resolvedContentVerticalPadding,
            };
          }
        }
      }

      selectionAnchor$.set(blockSelectionAnchor);
      onSelectionAnchorChangeRef.current?.(blockSelectionAnchor);
    }
  }, [
    blockSelection,
    dataRevision,
    enabled,
    getBlockIdAtIndex,
    getBlockIndexById,
    inactiveOverlayWidth,
    listRef,
    onSelectionAnchorChangeRef,
    resolvedContentHorizontalPadding,
    resolvedContentVerticalPadding,
    selectionAnchor$,
  ]);

  return null;
});

type MarkdownBlockSelectionInputProps = {
  inputRef: RefObject<TextInput | null>;
  inputText$: Observable<string>;
  onChangeText: (text: string) => void;
  onKeyPress: (event: { nativeEvent: { key: string } }) => void;
};

type NativeEditorFramePayload = {
  blockId: string;
  height: number;
  markdown?: string;
  rowHeight: number;
  width: number;
  x: number;
  y: number;
};

type NativeEditorFrameEvent = {
  nativeEvent: NativeEditorFramePayload;
};

type NativeBackspaceAtStartEvent = {
  nativeEvent: {
    blockId: string;
  };
};

type NativeEnterPressedEvent = {
  nativeEvent: {
    afterMarkdown: string;
    blockId: string;
    beforeMarkdown: string;
  };
};

function hasSameBlockPresentation(left: MarkdownBlockMetadata, right: MarkdownBlockMetadata) {
  return left.type === right.type && left.headingLevel === right.headingLevel && left.depth === right.depth;
}

function estimateSplitEditorContentHeight(
  block: MarkdownBlockSnapshot,
  sourceBlock: MarkdownBlockSnapshot,
  sourceFrame: OverlayFrame,
) {
  const estimatedHeight = estimateMarkdownEditorHeight(block.markdown, sourceFrame.width);
  const sourceEstimatedHeight = estimateMarkdownEditorHeight(sourceBlock.markdown, sourceFrame.width);
  if (!hasSameBlockPresentation(block, sourceBlock) || sourceFrame.height <= 0 || sourceEstimatedHeight <= 0) {
    return estimatedHeight;
  }

  return Math.ceil(estimatedHeight * (sourceFrame.height / sourceEstimatedHeight));
}

type MarkdownNativeEditorHostProps = {
  activeBlockId: string | null;
  activeBlockMarkdown: string;
  children: ReactNode;
  containerRef: RefObject<View | null>;
  markdownLayoutConfigJson?: string;
  onBeginEditing: (event: NativeEditorFrameEvent) => void;
  onBackspaceAtStart: (event: NativeBackspaceAtStartEvent) => void;
  onEnterPressed: (event: NativeEnterPressedEvent) => void;
  onEditorFrameChange: (event: NativeEditorFrameEvent) => void;
  onLayout: () => void;
  style: StyleProp<ViewStyle>;
};

const MarkdownNativeEditorHost = memo(function MarkdownNativeEditorHost({
  activeBlockId,
  activeBlockMarkdown,
  children,
  containerRef,
  markdownLayoutConfigJson,
  onBeginEditing,
  onBackspaceAtStart,
  onEnterPressed,
  onEditorFrameChange,
  onLayout,
  style,
}: MarkdownNativeEditorHostProps) {
  return (
    <MarkdownEditorHost
      ref={containerRef}
      activeBlockId={activeBlockId ?? ""}
      activeBlockMarkdown={activeBlockMarkdown}
      markdownLayoutConfigJson={markdownLayoutConfigJson}
      onBeginEditing={onBeginEditing}
      onBackspaceAtStart={onBackspaceAtStart}
      onEnterPressed={onEnterPressed}
      onEditorFrameChange={onEditorFrameChange}
      onLayout={onLayout}
      style={style}
    >
      {children}
    </MarkdownEditorHost>
  );
});

const MarkdownBlockSelectionInput = memo(function MarkdownBlockSelectionInput({
  inputRef,
  inputText$,
  onChangeText,
  onKeyPress,
}: MarkdownBlockSelectionInputProps) {
  const inputText = useValue(inputText$);

  return (
    <TextInput
      ref={inputRef}
      autoCorrect={false}
      multiline={false}
      onChangeText={onChangeText}
      onKeyPress={onKeyPress}
      style={styles.blockSelectionInput}
      value={inputText}
    />
  );
});

function countMarkdownLineBreaks(markdown: string) {
  return markdown.match(markdownLineBreakPattern)?.length ?? 0;
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function activeInputMarkdownForBlock(_block: MarkdownBlockSnapshot | undefined, markdown: string) {
  return markdown;
}

function activeInputSelectionForBlock(_block: MarkdownBlockSnapshot | undefined, selection: number, _markdown: string) {
  return selection;
}

type MarkdownLegendListState = ReturnType<LegendListRef["getState"]>;

function getBlockLayoutFromListState(listState: MarkdownLegendListState | undefined, index: number): BlockLayout | undefined {
  let layout: BlockLayout | undefined;
  if (
    listState &&
    index >= 0 &&
    typeof listState.positionAtIndex === "function" &&
    typeof listState.sizeAtIndex === "function"
  ) {
    const y = listState.positionAtIndex(index);
    const height = listState.sizeAtIndex(index);
    if (
      typeof y === "number" &&
      Number.isFinite(y) &&
      typeof height === "number" &&
      Number.isFinite(height)
    ) {
      layout = { y, height };
    }
  }
  return layout;
}

function isTwoLineMarkdownPasteFromEmptyBlock(markdown: string) {
  const lines = markdown.split(markdownLineBreakPattern);
  return lines.length === 2 && (
    (markdownFenceStartPattern.test(lines[0] ?? "") && (lines[1] ?? "").length > 0) ||
    (markdownListLinePattern.test(lines[0] ?? "") && markdownListLinePattern.test(lines[1] ?? ""))
  );
}

function isFencedCodeMarkdown(markdown: string) {
  return markdownFenceStartPattern.test(markdown.split(markdownLineBreakPattern)[0] ?? "");
}

function getStructuralSplitMarkdown(
  markdown: string,
  committedMarkdown: string,
  selection: { start: number; end: number },
) {
  const splitMarkdown = splitMarkdownAtFirstLineBreak(markdown);
  const isCollapsedSelection = selection.start === selection.end;
  const shouldSplit =
    splitMarkdown &&
    isCollapsedSelection &&
    !committedMarkdown.includes("\n") &&
    countMarkdownLineBreaks(markdown) === 1 &&
    !(committedMarkdown.length === 0 && isTwoLineMarkdownPasteFromEmptyBlock(markdown));

  return shouldSplit ? splitMarkdown : null;
}

function isMarkdownBlockSnapshot(block: MarkdownBlockMetadata): block is MarkdownBlockSnapshot {
  return typeof (block as Partial<MarkdownBlockSnapshot>).markdown === "string";
}

export const MarkdownDocument = forwardRef<MarkdownDocumentCommands, MarkdownDocumentProps>(
  (
    {
      adapter = nativeMarkdownDocumentAdapter,
      autoFocusFirstBlock,
      commandsRef,
      commentAnchor,
      contentContainerStyle,
      filename,
      markdownLayout,
      markdownStyle,
      onDirtyChange,
      onCommandStateChange,
      onError,
      onLoadError,
      onLoaded,
      onSaveStateChange,
      onSelectionAnchorChange,
      renderCommentBubble,
      renderSelectionToolbar,
      savePolicy,
      selectionAnchor$: selectionAnchorProp$,
      selectionToolbarEnabled,
      selectionToolbarAnchor,
      style,
      theme,
    },
    ref,
  ) => {
    "use no memo";
    // React Compiler does not yet support the editor's async transaction control flow.

    const loadVersionRef = useRef(0);
    const hydrateFrameRef = useRef<number | undefined>(undefined);
    const containerRef = useRef<View>(null);
    const listRef = useRef<LegendListRef | null>(null);
    const activeInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const commitQueueRef = useRef(Promise.resolve());
    const saveRef = useRef<(() => Promise<void>) | undefined>(undefined);
    const saveInFlightRef = useRef<Promise<void> | undefined>(undefined);
    const loadedSnapshotRef = useRef<MarkdownDocumentSnapshot | null>(null);
    const activeBlockIdRef = useRef<string | null>(null);
    const activeBlockSnapshotRef = useRef<MarkdownBlockSnapshot | undefined>(undefined);
    const blockSelectionInputRef = useRef<TextInput | null>(null);
    const blockSelectionGestureRef = useRef<BlockSelectionState | null>(null);
    const activeInputSelectionRef = useRef({ start: 0, end: 0 });
    const nativeEditingBlockIdRef = useRef<string | null>(null);
    const pendingSplitRef = useRef<{
      afterMarkdown: string;
      beforeMarkdown: string;
      sourceBlockId: string;
    } | null>(null);
    const pendingMergeRef = useRef<{
      currentMarkdown: string;
      mergedMarkdown: string;
      previousMarkdown: string;
      sourceBlockId: string;
    } | null>(null);
    const focusAdjacentBlockQueueRef = useRef<FocusAdjacentBlockRequest[]>([]);
    const focusAdjacentBlockInFlightRef = useRef(false);
    const pendingVerticalNavigationSelectionRef = useRef<PendingVerticalNavigationSelection | null>(null);
    const pendingVerticalNavigationFrameRef = useRef<number | undefined>(undefined);
    const activeRenderBlockIdRef = useRef<string | null>(null);
    const selectedRenderBlockIdsRef = useRef(new Set<string>());
    const commentAnchorBlockIdRef = useRef<string | null>(null);
    const overlayFrameRef = useRef<OverlayFrame | undefined>(undefined);
    const overlayFrameBlockIdRef = useRef<string | undefined>(undefined);
    const pendingInitialEditorFrameRef = useRef<{ blockId: string; frame: OverlayFrame } | undefined>(undefined);
    const draftMarkdownRef = useRef("");
    const committedMarkdownRef = useRef("");
    const currentRevisionRef = useRef(0);
    const savedRevisionRef = useRef(0);
    const isDirtyRef = useRef(false);
    const pendingRenderTransactionRef = useRef<MarkdownTransactionResult | undefined>(undefined);
    const autosavePausedRef = useRef(false);
    const undoStackRef = useRef<HistoryEntry[]>([]);
    const redoStackRef = useRef<HistoryEntry[]>([]);
    const commandStateRef = useRef<MarkdownDocumentCommandState>({ canRedo: false, canUndo: false });
    const suppressHistoryRef = useRef(false);
    const typingHistoryGroupRef = useRef<{
      entry: UpdateBlockHistoryEntry;
      updatedAt: number;
    } | undefined>(undefined);
    const selectionAnchorRequestRef = useRef(0);
    const internalSelectionAnchor$ = useObservable<MarkdownSelectionAnchor | null>(null);
    const selectionAnchor$ = selectionAnchorProp$ ?? internalSelectionAnchor$;
    const documentRenderState$ = useObservable(createMarkdownDocumentRenderState);
    const [blockDataSource, setBlockDataSource] = useState<MarkdownBlockDataSource | null>(null);
    const blockDataSourceRef = useRef<MarkdownBlockDataSource | null>(null);
    const [blockDataRevision, setBlockDataRevision] = useState(0);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [activeSelection, setActiveSelection] = useState(0);
    const activeActivationModeRef = useRef<ActiveBlockRenderState["activationMode"]>("programmatic");
    const [activeActivationMode, setActiveActivationModeState] =
      useState<ActiveBlockRenderState["activationMode"]>("programmatic");
    const [blockSelection, setBlockSelection] = useState<BlockSelectionState | null>(null);
    const blockSelectionRef = useRef<BlockSelectionState | null>(null);
    const blockSelectionInputText$ = useObservable("");
    const layoutMetrics$ = useObservable({
      containerWindowY: 0,
      contentContainerOffsetX: 0,
    });
    const [draftMarkdown, setDraftMarkdown] = useState("");
    const textSelectionAnchor$ = useObservable<MarkdownSelectionAnchor | null>(null);
    const inactiveOverlayWidth$ = useObservable(contentMaxWidth - contentHorizontalPadding * 2);
    const [documentState, setDocumentState] = useState<DocumentState>({ status: "loading" });
    const [reloadVersion, setReloadVersion] = useState(0);
    const onDirtyChangeRef = useLatestRef(onDirtyChange);
    const onCommandStateChangeRef = useLatestRef(onCommandStateChange);
    const onErrorRef = useLatestRef(onError);
    const onLoadErrorRef = useLatestRef(onLoadError);
    const onLoadedRef = useLatestRef(onLoaded);
    const onSaveStateChangeRef = useLatestRef(onSaveStateChange);
    const onSelectionAnchorChangeRef = useLatestRef(onSelectionAnchorChange);
    const resolvedMarkdownLayout = markdownLayout ?? defaultMarkdownLayout;
    const resolvedMarkdownStyle = markdownStyle ?? defaultMarkdownStyle;
    const getBlockCount = useCallback(() => blockDataSourceRef.current?.getLength() ?? 0, []);
    const getBlockIdAtIndex = useCallback((index: number) => blockDataSourceRef.current?.getItem(index), []);
    const getBlockIndexById = useCallback((blockId: string | undefined | null) => (
      blockId ? blockDataSourceRef.current?.getIndexForBlockId(blockId) ?? -1 : -1
    ), []);
    const nativeMarkdownLayoutConfigJson = useMemo(
      () => usesNativeEditorOverlay ? JSON.stringify({ blockSpacing: resolvedMarkdownLayout.blockSpacing }) : undefined,
      [resolvedMarkdownLayout],
    );
    const resolvedContentMaxWidth = resolvedMarkdownLayout.content?.maxWidth ?? contentMaxWidth;
    const resolvedContentHorizontalPadding = resolvedMarkdownLayout.content?.horizontalPadding ?? contentHorizontalPadding;
    const resolvedContentVerticalPadding = resolvedMarkdownLayout.content?.verticalPadding ?? 48;

    const setActiveActivationMode = useCallback((activationMode: ActiveBlockRenderState["activationMode"]) => {
      activeActivationModeRef.current = activationMode;
      setActiveActivationModeState(activationMode);
    }, []);

    const reportAsyncError = useCallback(
      (error: unknown) => {
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      },
      [onErrorRef],
    );

    const clearAutosaveTimer = useCallback(() => {
      if (autosaveTimerRef.current !== undefined) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = undefined;
      }
    }, []);

    const clearOverlayFrame = useCallback(() => {
      overlayFrameRef.current = undefined;
      overlayFrameBlockIdRef.current = undefined;
    }, []);

    const cancelPendingVerticalNavigationFrame = useCallback(() => {
      if (pendingVerticalNavigationFrameRef.current !== undefined) {
        cancelAnimationFrame(pendingVerticalNavigationFrameRef.current);
        pendingVerticalNavigationFrameRef.current = undefined;
      }
    }, []);

    const schedulePendingVerticalNavigationSelection = useCallback(() => {
      const pending = pendingVerticalNavigationSelectionRef.current;
      if (pending && pending.blockId === activeBlockIdRef.current) {
        cancelPendingVerticalNavigationFrame();
        pendingVerticalNavigationFrameRef.current = requestAnimationFrame(() => {
          pendingVerticalNavigationFrameRef.current = undefined;
          const latestPending = pendingVerticalNavigationSelectionRef.current;
          if (latestPending && latestPending.blockId === activeBlockIdRef.current) {
            activeInputRef.current?.setSelectionForVerticalNavigation(latestPending.direction, latestPending.preferredX);
            pendingVerticalNavigationSelectionRef.current = null;
          }
        });
      }
    }, [cancelPendingVerticalNavigationFrame]);

    const autosaveEnabled = savePolicy?.autosave ?? true;
    const autosaveDebounceMs = Math.min(Math.max(savePolicy?.debounceMs ?? 2000, 0), 2000);

    const scheduleAutosave = useCallback(() => {
      clearAutosaveTimer();
      if (!autosaveEnabled || autosavePausedRef.current) {
        return;
      }

      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = undefined;
        saveRef.current?.().catch(reportAsyncError);
      }, autosaveDebounceMs);
    }, [autosaveDebounceMs, autosaveEnabled, clearAutosaveTimer, reportAsyncError]);

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
        onSaveStateChangeRef.current?.(nextSaveState);
      },
      [onSaveStateChangeRef],
    );

    const setNextBlockSelection = useCallback((nextBlockSelection: BlockSelectionState | null) => {
      blockSelectionRef.current = nextBlockSelection;
      setBlockSelection(nextBlockSelection);
    }, []);

    const setBlockRowCommentAnchor = useCallback((blockId: string, nextCommentAnchor: MarkdownSelectionAnchor | null) => {
      const rowState$ = documentRenderState$.rowStatesById.get(blockId);
      const rowState = rowState$.peek();
      if (rowState?.commentAnchor !== nextCommentAnchor) {
        if (rowState || nextCommentAnchor) {
          rowState$.set({
            commentAnchor: nextCommentAnchor,
            renderRevision: rowState?.renderRevision ?? 0,
          });
        }
      }
    }, [documentRenderState$]);

    const bumpBlockRowRenderRevision = useCallback((blockId: string) => {
      const rowState$ = documentRenderState$.rowStatesById.get(blockId);
      const rowState = rowState$.peek();
      rowState$.set({
        commentAnchor: rowState?.commentAnchor ?? null,
        renderRevision: (rowState?.renderRevision ?? 0) + 1,
      });
    }, [documentRenderState$]);

    const bumpTransactionRowRenderRevisions = useCallback((result: MarkdownTransactionResult) => {
      batch(() => {
        result.retiredBlockIds.forEach((blockId) => {
          documentRenderState$.rowStatesById.get(blockId).delete();
        });
        result.changedRange.blockIds.forEach(bumpBlockRowRenderRevision);
      });
    }, [bumpBlockRowRenderRevision, documentRenderState$]);

    const publishCommandState = useCallback(() => {
      const nextState: MarkdownDocumentCommandState = {
        canRedo: redoStackRef.current.length > 0,
        canUndo: undoStackRef.current.length > 0,
      };
      const currentState = commandStateRef.current;
      if (nextState.canRedo !== currentState.canRedo || nextState.canUndo !== currentState.canUndo) {
        commandStateRef.current = nextState;
        onCommandStateChangeRef.current?.(nextState);
      }
    }, [onCommandStateChangeRef]);

    const clearTypingHistoryGroup = useCallback(() => {
      typingHistoryGroupRef.current = undefined;
    }, []);

    const pushUpdateBlockHistoryEntry = useCallback(
      (entry: UpdateBlockHistoryEntry, options: { groupTyping?: boolean } = {}) => {
        if (suppressHistoryRef.current) {
          return;
        }

        const now = Date.now();
        const currentGroup = typingHistoryGroupRef.current;
        if (
          options.groupTyping &&
          currentGroup &&
          currentGroup.entry.blockId === entry.blockId &&
          currentGroup.entry.afterMarkdown === entry.beforeMarkdown &&
          now - currentGroup.updatedAt <= typingHistoryGroupTimeoutMs
        ) {
          currentGroup.entry.afterMarkdown = entry.afterMarkdown;
          currentGroup.updatedAt = now;
          redoStackRef.current = [];
          publishCommandState();
          return;
        }

        undoStackRef.current.push(entry);
        redoStackRef.current = [];
        typingHistoryGroupRef.current = options.groupTyping
          ? { entry, updatedAt: now }
          : undefined;
        publishCommandState();
      },
      [publishCommandState],
    );

    const publishTextSelectionAnchor = useCallback((anchor: MarkdownSelectionAnchor | null) => {
      textSelectionAnchor$.set(anchor);
      if (!blockSelectionRef.current && selectionToolbarAnchor === undefined) {
        selectionAnchor$.set(anchor);
        onSelectionAnchorChangeRef.current?.(anchor);
      }
    }, [onSelectionAnchorChangeRef, selectionAnchor$, selectionToolbarAnchor, textSelectionAnchor$]);

    const clearTextSelectionAnchor = useCallback(() => {
      selectionAnchorRequestRef.current += 1;
      activeInputSelectionRef.current = { start: 0, end: 0 };
      publishTextSelectionAnchor(null);
    }, [publishTextSelectionAnchor]);

    const updateTextSelectionAnchor = useCallback((selection: { start: number; end: number }) => {
      activeInputSelectionRef.current = selection;
      const requestId = selectionAnchorRequestRef.current + 1;
      selectionAnchorRequestRef.current = requestId;
      const selectedLength = Math.abs(selection.end - selection.start);
      const selectionStart = Math.min(selection.start, selection.end);
      const selectionEnd = Math.max(selection.start, selection.end);

      if (selection.start === selection.end) {
        publishTextSelectionAnchor(null);
        return;
      }

      requestAnimationFrame(() => {
        const input = activeInputRef.current;
        if (!input || !containerRef.current || requestId !== selectionAnchorRequestRef.current) {
          return;
        }

        input.getCaretRect().then((caretRect) => {
          if (requestId !== selectionAnchorRequestRef.current) {
            return;
          }

          input.measureInWindow((inputX, inputY, inputWidth, inputHeight) => {
            containerRef.current?.measureInWindow((containerX, containerY) => {
              if (requestId !== selectionAnchorRequestRef.current) {
                return;
              }
              const measuredItemX = inputX - containerX;
              const measuredItemY = inputY - containerY;
              const activeBlockId = activeBlockIdRef.current ?? undefined;
              const activeBlockIndex = getBlockIndexById(activeBlockId);
              const activeBlockLayout = getBlockLayoutFromListState(listRef.current?.getState(), activeBlockIndex);
              const nativeOverlayFrame = usesNativeEditorOverlay ? overlayFrameRef.current : undefined;
              const contentContainerOffsetX = layoutMetrics$.contentContainerOffsetX.peek();
              const itemX = activeBlockLayout
                ? contentContainerOffsetX + resolvedContentHorizontalPadding
                : nativeOverlayFrame?.left ?? measuredItemX;
              const itemY = activeBlockLayout
                ? activeBlockLayout.y + resolvedContentVerticalPadding
                : nativeOverlayFrame
                ? nativeOverlayFrame.top + resolvedContentVerticalPadding
                : measuredItemY;
              const inactiveOverlayWidth = inactiveOverlayWidth$.peek();
              const itemWidth = activeBlockLayout
                ? inactiveOverlayWidth
                : nativeOverlayFrame?.width ?? inputWidth;
              const itemHeight = activeBlockLayout?.height ?? nativeOverlayFrame?.height ?? inputHeight;
              const contentItemX = itemX - contentContainerOffsetX;
              const paragraphStyle = resolvedMarkdownStyle.paragraph;
              const paragraphFontSize = typeof paragraphStyle?.fontSize === "number" ? paragraphStyle.fontSize : 16;
              const paragraphLineHeight = typeof paragraphStyle?.lineHeight === "number"
                ? paragraphStyle.lineHeight
                : Math.ceil(paragraphFontSize * 1.5);
              const anchor = resolveTextSelectionAnchor({
                blockId: activeBlockId,
                caretRect,
                contentItemX,
                itemHeight,
                itemWidth,
                itemY,
                paragraphLineHeight,
                scrollOffsetY: activeBlockLayout || nativeOverlayFrame ? 0 : (listRef.current?.getState().scroll ?? 0),
                selectedLength,
              });
              publishTextSelectionAnchor(anchor);
            });
          });
        }).catch(reportAsyncError);
      });
    }, [
      getBlockIndexById,
      inactiveOverlayWidth$,
      layoutMetrics$,
      publishTextSelectionAnchor,
      reportAsyncError,
      resolvedContentHorizontalPadding,
      resolvedContentVerticalPadding,
      resolvedMarkdownStyle,
    ]);
    const handleChangeSelectionRef = useLatestRef(updateTextSelectionAnchor);

    const cancelHydration = useCallback(() => {
      if (hydrateFrameRef.current !== undefined) {
        cancelAnimationFrame(hydrateFrameRef.current);
        hydrateFrameRef.current = undefined;
      }
    }, []);

    const getBlockAtIndexForRender = useCallback((blockId: string, index: number): MarkdownBlockMetadata | undefined => {
      const activeBlock = activeBlockSnapshotRef.current;
      if (activeBlock?.id === blockId) {
        return activeBlock;
      }

      const snapshot = loadedSnapshotRef.current;
      if (!snapshot) {
        return undefined;
      }

      const block = adapter.getBlockAtIndexSync?.(snapshot.documentId, index);
      if (block?.id !== blockId) {
        const initialBlock = snapshot.initialBlocks[index];
        return initialBlock?.id === blockId ? initialBlock : undefined;
      }

      return block;
    }, [adapter]);

    const getMarkdownBlockItemType = useCallback((blockId: string | undefined, index: number) => {
      if (!blockId) {
        return "unknown";
      }
      const block = getBlockAtIndexForRender(blockId, index);
      if (!block) {
        return "unknown";
      }

      return block.headingLevel > 0
        ? `${block.type}:${block.headingLevel}:${block.depth}`
        : `${block.type}:${block.depth}`;
    }, [getBlockAtIndexForRender]);

    const loadBlockAtIndex = useCallback(async (blockId: string | undefined, index: number) => {
      if (!blockId || documentState.status !== "loaded") {
        return undefined;
      }

      const activeBlock = activeBlockSnapshotRef.current;
      if (activeBlock?.id === blockId) {
        return activeBlock;
      }

      return adapter.getBlock(documentState.snapshot.documentId, blockId);
    }, [adapter, documentState]);

    const loadBlocksForRange = useCallback(async (startIndex: number, count: number) => {
      if (documentState.status !== "loaded" || count <= 0) {
        return [];
      }

      return adapter.getBlocks(documentState.snapshot.documentId, startIndex, count);
    }, [adapter, documentState]);

    const mergeBlocks = useCallback((blocks: MarkdownBlockMetadata[], requestRevision: number) => {
      if (blocks.length === 0 || requestRevision !== currentRevisionRef.current) {
        return;
      }

      blockDataSourceRef.current?.appendHydratedBlocks(blocks);
    }, []);

    const validateTransactionResult = useCallback((result: MarkdownTransactionResult) => {
      blockDataSourceRef.current?.validateTransactionResult(result);
    }, []);

    const applyTransactionResult = useCallback((result: MarkdownTransactionResult, preservedFirstBlockId?: string) => {
      const dataSource = blockDataSourceRef.current;
      if (!dataSource) {
        throw new Error("Markdown block data source is not loaded.");
      }
      dataSource.applyTransactionResult(result, preservedFirstBlockId);
      currentRevisionRef.current = result.revision;
      bumpTransactionRowRenderRevisions(result);

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
    }, [bumpTransactionRowRenderRevisions]);

    const updateRenderedBlockMarkdown = useCallback((blockId: string, markdown: string) => {
      const block = activeBlockSnapshotRef.current?.id === blockId ? activeBlockSnapshotRef.current : undefined;
      if (!block || block.markdown === markdown) {
        return;
      }

      const nextBlock = {
        ...block,
        ...resolveOptimisticBlockPresentation(markdown),
        contentEndByte: block.contentStartByte !== undefined ? block.contentStartByte + markdown.length : block.contentEndByte,
        markdown,
        sourceEndByte: block.sourceStartByte + markdown.length,
        textRevision: block.textRevision + 1,
      };
      activeBlockSnapshotRef.current = nextBlock;
      if (activeBlockIdRef.current === blockId) {
        const previousRenderState = documentRenderState$.activeBlocksById.get(blockId).peek();
        const pendingEditorFrame = overlayFrameBlockIdRef.current === blockId ? overlayFrameRef.current : undefined;
        documentRenderState$.activeBlocksById.get(blockId).set({
          activationMode: previousRenderState?.activationMode ?? activeActivationModeRef.current,
          block: nextBlock,
          draftMarkdown: markdown,
          editorFrame: previousRenderState?.editorFrame ?? pendingEditorFrame,
          selection: activeInputSelectionRef.current.start,
        });
      }
    }, [documentRenderState$]);

    const runCommitActiveBlock = useCallback(async (options: { updateReactState?: boolean } = {}) => {
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
        if (updateReactState) {
          updateRenderedBlockMarkdown(activeBlockIdValue, markdown);
        }
        const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
          type: "updateBlockMarkdown",
          blockId: activeBlockIdValue,
          markdown,
        });
        validateTransactionResult(result);
        const firstChangedBlockId = result.changedRange.blockIds[0];
        const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
        let isSingleActiveBlockChange = false;
        if (result.changedRange.blockIds.length === 1) {
          isSingleActiveBlockChange = firstChangedBlockId === activeBlockIdValue;
        }
        if (isSingleActiveBlockChange) {
          pushUpdateBlockHistoryEntry(
            {
              type: "updateBlockMarkdown",
              blockId: activeBlockIdValue,
              beforeMarkdown,
              afterMarkdown: markdown,
            },
            { groupTyping: true },
          );
        } else if (firstChangedBlockId) {
          if (lastChangedBlockId) {
            clearTypingHistoryGroup();
            undoStackRef.current.push({
              type: "replaceBlockRange",
              startBlockId: firstChangedBlockId,
              endBlockId: lastChangedBlockId,
              replacementMarkdown: beforeMarkdown,
              inverseMarkdown: markdown,
            });
            redoStackRef.current = [];
            publishCommandState();
          }
        }
        if (activeBlockIdRef.current === activeBlockIdValue) {
          let nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue);
          if (!nextActiveBlock) {
            nextActiveBlock = result.changedBlocks[0];
          }
          if (nextActiveBlock) {
            activeBlockSnapshotRef.current = nextActiveBlock;
            activeBlockIdRef.current = nextActiveBlock.id;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            if (updateReactState || !usesNativeEditorOverlay) {
              setDraftMarkdown(nextActiveBlock.markdown);
              setActiveActivationMode("programmatic");
              setActiveSelection(Math.min(activeInputSelectionRef.current.start, nextActiveBlock.markdown.length));
            }
            setActiveBlockId(nextActiveBlock.id);
          } else {
            committedMarkdownRef.current = markdown;
          }
        }
        if (updateReactState) {
          applyTransactionResult(result);
          pendingRenderTransactionRef.current = undefined;
        } else {
          currentRevisionRef.current = result.revision;
          pendingRenderTransactionRef.current = result;
        }
      } catch (error) {
        if (updateReactState) {
          updateRenderedBlockMarkdown(activeBlockIdValue, committedMarkdownRef.current);
          draftMarkdownRef.current = committedMarkdownRef.current;
          setDraftMarkdown(committedMarkdownRef.current);
          activeInputRef.current?.setValue(activeInputMarkdownForBlock(activeBlockSnapshotRef.current, committedMarkdownRef.current));
          setActiveActivationMode("programmatic");
          setActiveSelection(Math.min(activeInputSelectionRef.current.start, committedMarkdownRef.current.length));
        }
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      }
    }, [
      adapter,
      applyTransactionResult,
      clearTypingHistoryGroup,
      documentState,
      onErrorRef,
      publishCommandState,
      pushUpdateBlockHistoryEntry,
      updateRenderedBlockMarkdown,
      validateTransactionResult,
    ]);

    const commitActiveBlock = useCallback((options: { updateReactState?: boolean } = {}) => {
      const commitPromise = commitQueueRef.current
        .catch(() => {})
        .then(() => runCommitActiveBlock(options));
      commitQueueRef.current = commitPromise.catch(() => {});
      return commitPromise;
    }, [runCommitActiveBlock]);

    const setActiveBlock = useCallback((
      block: MarkdownBlockSnapshot,
      selection: number,
      activationMode: ActiveBlockRenderState["activationMode"] = "programmatic",
    ) => {
      activeBlockSnapshotRef.current = block;
      nativeEditingBlockIdRef.current = block.id;
      activeBlockIdRef.current = block.id;
      activeInputSelectionRef.current = { start: selection, end: selection };
      draftMarkdownRef.current = block.markdown;
      committedMarkdownRef.current = block.markdown;
      setActiveActivationMode(activationMode);
      setDraftMarkdown(block.markdown);
      setActiveSelection(selection);
      setActiveBlockId(block.id);
    }, [setActiveActivationMode]);

    const activateBlock = useCallback(
      (block: MarkdownBlockSnapshot, selection: number) => {
        commitActiveBlock({ updateReactState: true }).catch(reportAsyncError);
        blockSelectionGestureRef.current = null;
        setNextBlockSelection(null);
        clearTextSelectionAnchor();
        setActiveBlock(block, selection);
      },
      [clearTextSelectionAnchor, commitActiveBlock, reportAsyncError, setActiveBlock, setNextBlockSelection],
    );

    useEffect(() => {
      schedulePendingVerticalNavigationSelection();
      return cancelPendingVerticalNavigationFrame;
    }, [activeBlockId, cancelPendingVerticalNavigationFrame, draftMarkdown, schedulePendingVerticalNavigationSelection]);

    const beginBlockSelection = useCallback(
      (anchorBlockId: string, focusBlockId: string) => {
        const activeBlockIdValue = activeBlockIdRef.current;
        commitActiveBlock({ updateReactState: true }).catch(reportAsyncError);
        clearTextSelectionAnchor();
        if (activeBlockIdValue && activeBlockIdValue !== anchorBlockId) {
          activeInputRef.current?.blur();
          nativeEditingBlockIdRef.current = null;
          clearOverlayFrame();
          activeBlockSnapshotRef.current = undefined;
          activeBlockIdRef.current = null;
          setActiveBlockId(null);
          setActiveActivationMode("programmatic");
          setActiveSelection(0);
        }
        const nextBlockSelection = { anchorBlockId, focusBlockId };
        blockSelectionGestureRef.current = nextBlockSelection;
        setNextBlockSelection(nextBlockSelection);
      },
      [clearOverlayFrame, clearTextSelectionAnchor, commitActiveBlock, reportAsyncError, setNextBlockSelection],
    );

    const updateBlockSelectionGesture = useCallback(
      (sourceBlockId: string, focusBlockId: string) => {
        const nextSelection = {
          anchorBlockId: blockSelectionGestureRef.current?.anchorBlockId ?? sourceBlockId,
          focusBlockId,
        };
        blockSelectionGestureRef.current = nextSelection;
        setNextBlockSelection(nextSelection);
      },
      [setNextBlockSelection],
    );

    const blockIdAtWindowY = useCallback((y: number, direction: "down" | "up") => {
      const listState = listRef.current?.getState();
      const contentY = y - layoutMetrics$.containerWindowY.peek() + (listState?.scroll ?? 0);
      return findBlockIdAtContentY({
        direction,
        endIndex: listState?.endBuffered,
        getBlockCount,
        getBlockIdAtIndex,
        getBlockLayout: (_blockId, index) => getBlockLayoutFromListState(listState, index),
        startIndex: listState?.startBuffered,
        y: contentY,
      });
    }, [getBlockCount, getBlockIdAtIndex, layoutMetrics$]);

    const scrollBlockIntoView = useCallback((block: MarkdownBlockSnapshot) => {
      const blockIndex = getBlockIndexById(block.id);
      const listState = listRef.current?.getState();
      const blockLayout = getBlockLayoutFromListState(listState, blockIndex);
      const viewportHeight = listState?.scrollLength ?? 0;
      const currentScrollOffset = listState?.scroll ?? 0;

      if (blockLayout && viewportHeight > 0) {
        const scrollMargin = 12;
        const blockTop = blockLayout.y;
        const blockBottom = blockLayout.y + blockLayout.height;
        const visibleTop = currentScrollOffset;
        const visibleBottom = currentScrollOffset + viewportHeight;
        let nextScrollOffset: number | undefined;

        if (blockTop < visibleTop + scrollMargin) {
          nextScrollOffset = Math.max(0, blockTop - scrollMargin);
        } else if (blockBottom > visibleBottom - scrollMargin) {
          nextScrollOffset = Math.max(0, blockBottom - viewportHeight + scrollMargin);
        }

        if (nextScrollOffset !== undefined && nextScrollOffset !== currentScrollOffset) {
          listRef.current?.scrollToOffset({ animated: true, offset: nextScrollOffset }).catch(reportAsyncError);
        }
      }
    }, [getBlockIndexById, reportAsyncError]);

    const prepareBlockIndexForKeyboardFocus = useCallback(async (index: number, direction: "up" | "down") => {
      const list = listRef.current;
      const state = list?.getState();
      if (!list || !state) {
        return;
      }

      const targetIsVisible = index >= state.start && index <= state.end;
      const targetIsMounted = state.elementAtIndex(index) !== undefined;
      if (!targetIsVisible || !targetIsMounted) {
        await list.scrollToIndex({
          animated: false,
          index,
          viewPosition: direction === "up" ? 0 : 1,
        });

        for (let frame = 0; frame < 4; frame += 1) {
          if (list.getState().elementAtIndex(index) !== undefined) {
            break;
          }
          await waitForAnimationFrame();
        }
      }
    }, []);

    const measureContainerWindowLayout = useCallback((event?: LayoutChangeEvent) => {
      if (event) {
        const containerWidth = event.nativeEvent.layout.width;
        const constrainedContentWidth = Math.min(containerWidth, resolvedContentMaxWidth);
        const nextContentWidth = Math.max(1, constrainedContentWidth - resolvedContentHorizontalPadding * 2);
        layoutMetrics$.contentContainerOffsetX.set(Math.max(0, (containerWidth - constrainedContentWidth) / 2));
        inactiveOverlayWidth$.set(nextContentWidth);
      }
      requestAnimationFrame(() => {
        containerRef.current?.measureInWindow((_x, y) => {
          layoutMetrics$.containerWindowY.set(y);
        });
      });
    }, [inactiveOverlayWidth$, layoutMetrics$, resolvedContentHorizontalPadding, resolvedContentMaxWidth]);

    const handleSelectionDragOutside = useCallback(
      (blockId: string, event: SelectionDragOutsideEvent) => {
        if (event.direction === "end") {
          blockSelectionGestureRef.current = null;
          if (blockSelectionRef.current) {
            setNextBlockSelection(blockSelectionRef.current);
          }
          blockSelectionInputRef.current?.focus();
          return;
        }

        const blockIndex = getBlockIndexById(blockId);
        if (blockIndex < 0) {
          return;
        }

        const targetBlockId = typeof event.windowY === "number" ? blockIdAtWindowY(event.windowY, event.direction === "up" ? "up" : "down") : undefined;
        if (targetBlockId && targetBlockId !== blockId) {
          if (blockSelectionGestureRef.current) {
            updateBlockSelectionGesture(blockId, targetBlockId);
          } else {
            beginBlockSelection(blockId, targetBlockId);
          }
          return;
        }

        const nextBlockId = getBlockIdAtIndex(event.direction === "up" ? blockIndex - 1 : blockIndex + 1);
        if (!nextBlockId) {
          return;
        }

        if (blockSelectionGestureRef.current) {
          updateBlockSelectionGesture(blockId, nextBlockId);
        } else {
          beginBlockSelection(blockId, nextBlockId);
        }
      },
      [beginBlockSelection, blockIdAtWindowY, getBlockIdAtIndex, getBlockIndexById, setNextBlockSelection, updateBlockSelectionGesture],
    );
    const handleSelectionDragOutsideRef = useLatestRef(handleSelectionDragOutside);

    const estimateInitialNativeEditorFrame = useCallback(
      (
        block: MarkdownBlockSnapshot,
        sourceBlock: MarkdownBlockSnapshot,
        previousBlock: MarkdownBlockMetadata | undefined,
        hasPreviousBlock: boolean,
        hasNextBlock: boolean,
      ): OverlayFrame | undefined => {
        const sourceFrame = activeBlockIdRef.current && overlayFrameBlockIdRef.current === activeBlockIdRef.current
          ? overlayFrameRef.current
          : undefined;
        if (!sourceFrame) {
          return undefined;
        }

        const rowStyle = blockRowSpacingStyle(block, previousBlock, hasPreviousBlock, hasNextBlock, resolvedMarkdownLayout);
        const paddingTop = typeof rowStyle.paddingTop === "number" ? rowStyle.paddingTop : 0;
        const paddingBottom = typeof rowStyle.paddingBottom === "number" ? rowStyle.paddingBottom : 0;
        const height = estimateSplitEditorContentHeight(block, sourceBlock, sourceFrame);
        return {
          height,
          left: sourceFrame.left,
          rowHeight: height + paddingTop + paddingBottom,
          top: sourceFrame.top + sourceFrame.rowHeight,
          width: sourceFrame.width,
        };
      },
      [resolvedMarkdownLayout],
    );

    const splitActiveBlock = useCallback(
      async (block: MarkdownBlockSnapshot, beforeMarkdown: string, afterMarkdown: string) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return;
        }

        const pendingSplit = {
          afterMarkdown,
          beforeMarkdown,
          sourceBlockId: block.id,
        };
        pendingSplitRef.current = pendingSplit;

        try {
          clearTypingHistoryGroup();
          const transaction = {
            type: "splitBlock",
            blockId: block.id,
            beforeMarkdown,
            afterMarkdown,
          } as const;
          const transactionResult = adapter.applyTransaction(documentState.snapshot.documentId, transaction);
          const result = transactionResult instanceof Promise ? await transactionResult : transactionResult;
          validateTransactionResult(result);
          applyTransactionResult(result, block.id);

          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          if (!suppressHistoryRef.current) {
            if (firstChangedBlockId) {
              if (lastChangedBlockId) {
                const historyEntry: HistoryEntry = {
                  type: "replaceBlockRange",
                  startBlockId: firstChangedBlockId,
                  endBlockId: lastChangedBlockId,
                  replacementMarkdown: block.markdown,
                  inverseMarkdown: `${beforeMarkdown}\n\n${afterMarkdown}`,
                };
                if (block.type === "codeBlock") {
                  historyEntry.inverseSplit = {
                    afterMarkdown,
                    beforeMarkdown,
                  };
                }
                undoStackRef.current.push(historyEntry);
                redoStackRef.current = [];
                publishCommandState();
              }
            }
          }

          let nextActiveBlockId = result.changedRange.blockIds[1];
          if (!nextActiveBlockId) {
            nextActiveBlockId = result.changedRange.blockIds[0];
          }
          if (!nextActiveBlockId) {
            nextActiveBlockId = block.id;
          }
          const nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === nextActiveBlockId);
          const pendingAfterMarkdown = pendingSplitRef.current === pendingSplit
            ? pendingSplit.afterMarkdown
            : afterMarkdown;
          if (pendingSplitRef.current === pendingSplit) {
            pendingSplitRef.current = null;
          }
          const nextActiveBlockSnapshot = nextActiveBlock ?? {
            ...block,
            id: nextActiveBlockId,
            markdown: afterMarkdown,
          };
          const nextActiveBlockOffset = result.changedRange.blockIds.indexOf(nextActiveBlockId);
          const previousActiveBlockId = nextActiveBlockOffset > 0
            ? result.changedRange.blockIds[nextActiveBlockOffset - 1]
            : undefined;
          const previousActiveBlock = previousActiveBlockId
            ? result.changedBlocks.find((candidate) => candidate.id === previousActiveBlockId)
            : undefined;
          const nextBlockIndex = result.changedRange.startBlockIndex + Math.max(0, nextActiveBlockOffset);
          const nextBlockCount =
            documentState.snapshot.blockCount -
            result.changedRange.deleteCount +
            result.changedRange.blockIds.length;
          const initialEditorFrame = estimateInitialNativeEditorFrame(
            nextActiveBlockSnapshot,
            block,
            previousActiveBlock,
            nextBlockIndex > 0,
            nextBlockIndex + 1 < nextBlockCount,
          );
          if (initialEditorFrame) {
            pendingInitialEditorFrameRef.current = {
              blockId: nextActiveBlockId,
              frame: initialEditorFrame,
            };
          }
          activeBlockSnapshotRef.current = nextActiveBlockSnapshot;
          activeBlockIdRef.current = nextActiveBlockId;
          nativeEditingBlockIdRef.current = nextActiveBlockId;
          draftMarkdownRef.current = nextActiveBlockSnapshot.markdown;
          committedMarkdownRef.current = nextActiveBlockSnapshot.markdown;
          setDraftMarkdown(nextActiveBlockSnapshot.markdown);
          setActiveActivationMode("programmatic");
          activeInputSelectionRef.current = { start: 0, end: 0 };
          setActiveSelection(0);
          setActiveBlockId(nextActiveBlockId);

          if (pendingAfterMarkdown !== nextActiveBlockSnapshot.markdown) {
            updateRenderedBlockMarkdown(nextActiveBlockId, pendingAfterMarkdown);
            const updateResult = await adapter.applyTransaction(documentState.snapshot.documentId, {
              type: "updateBlockMarkdown",
              blockId: nextActiveBlockId,
              markdown: pendingAfterMarkdown,
            });
            validateTransactionResult(updateResult);
            pushUpdateBlockHistoryEntry({
              type: "updateBlockMarkdown",
              blockId: nextActiveBlockId,
              beforeMarkdown: nextActiveBlockSnapshot.markdown,
              afterMarkdown: pendingAfterMarkdown,
            });
            applyTransactionResult(updateResult);

            const updatedActiveBlock = updateResult.changedBlocks[0];
            if (updatedActiveBlock) {
              activeBlockSnapshotRef.current = updatedActiveBlock;
              draftMarkdownRef.current = updatedActiveBlock.markdown;
              committedMarkdownRef.current = updatedActiveBlock.markdown;
              setDraftMarkdown(updatedActiveBlock.markdown);
              setActiveSelection(updatedActiveBlock.markdown.length);
              const activeInput = activeInputRef.current;
              if (activeInput) {
                activeInput.setValue(activeInputMarkdownForBlock(updatedActiveBlock, updatedActiveBlock.markdown));
                activeInput.setSelection(updatedActiveBlock.markdown.length, updatedActiveBlock.markdown.length);
              }
            }
          }
          markDirty();
        } catch (error) {
          if (pendingSplitRef.current === pendingSplit) {
            pendingSplitRef.current = null;
          }
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        clearTypingHistoryGroup,
        documentState,
        estimateInitialNativeEditorFrame,
        markDirty,
        onErrorRef,
        publishCommandState,
        pushUpdateBlockHistoryEntry,
        updateRenderedBlockMarkdown,
        validateTransactionResult,
      ],
    );

    const handleChangeMarkdown = useCallback(
      (block: MarkdownBlockSnapshot, markdown: string) => {
        if (activeBlockIdRef.current !== block.id) {
          return;
        }

        const pendingSplit = pendingSplitRef.current;
        if (pendingSplit?.sourceBlockId === block.id) {
          const splitMarkdown = getStructuralSplitMarkdown(markdown, committedMarkdownRef.current, activeInputSelectionRef.current);
          if (splitMarkdown && splitMarkdown.beforeMarkdown === pendingSplit.beforeMarkdown) {
            const continuationMarkdown = getSplitContinuationMarkdown(splitMarkdown.beforeMarkdown, splitMarkdown.afterMarkdown);
            pendingSplit.afterMarkdown = continuationMarkdown.afterMarkdown;
            return;
          }
        }

        const pendingMerge = pendingMergeRef.current;
        if (pendingMerge?.sourceBlockId === block.id) {
          pendingMerge.currentMarkdown = markdown;
          pendingMerge.mergedMarkdown = `${pendingMerge.previousMarkdown}${markdown}`;
          return;
        }

        if (block.type === "codeBlock") {
          const committedMarkdown = committedMarkdownRef.current;
          const selection = activeInputSelectionRef.current;
          const isCollapsedSelection = selection.start === selection.end;
          const isBoundaryNewline =
            isCollapsedSelection &&
            ((selection.start === 0 && markdown === `\n${committedMarkdown}`) ||
              (selection.start === committedMarkdown.length && markdown === `${committedMarkdown}\n`));

          if (isBoundaryNewline) {
            splitActiveBlock(
              block,
              selection.start === 0 ? "" : committedMarkdown,
              selection.start === 0 ? committedMarkdown : "",
            ).catch(reportAsyncError);
            return;
          }
        }

        if (block.type !== "codeBlock" && !isFencedCodeMarkdown(markdown)) {
          const splitMarkdown = getStructuralSplitMarkdown(markdown, committedMarkdownRef.current, activeInputSelectionRef.current);
          if (splitMarkdown) {
            const continuationMarkdown = getSplitContinuationMarkdown(splitMarkdown.beforeMarkdown, splitMarkdown.afterMarkdown);
            splitActiveBlock(
              block,
              continuationMarkdown.beforeMarkdown ?? splitMarkdown.beforeMarkdown,
              continuationMarkdown.afterMarkdown,
            ).catch(reportAsyncError);
            return;
          }
        }

        draftMarkdownRef.current = markdown;
        if (!usesNativeEditorOverlay) {
          setDraftMarkdown(markdown);
        }
        updateRenderedBlockMarkdown(block.id, markdown);
        markDirty();
        commitActiveBlock({ updateReactState: false }).catch(reportAsyncError);
      },
      [commitActiveBlock, markDirty, reportAsyncError, splitActiveBlock, updateRenderedBlockMarkdown],
    );
    const handleChangeMarkdownRef = useLatestRef(handleChangeMarkdown);

    const handleEditorBlur = useCallback(() => {
      const blurredBlockId = activeBlockIdRef.current;
      commitActiveBlock({ updateReactState: true }).then(() => {
        if (activeBlockIdRef.current !== blurredBlockId) {
          return;
        }
        nativeEditingBlockIdRef.current = null;
        clearOverlayFrame();
        activeBlockSnapshotRef.current = undefined;
        activeBlockIdRef.current = null;
        setActiveBlockId(null);
        setActiveActivationMode("programmatic");
        setActiveSelection(0);
        clearTextSelectionAnchor();
        clearTypingHistoryGroup();
      }).catch(reportAsyncError);
    }, [clearOverlayFrame, clearTextSelectionAnchor, clearTypingHistoryGroup, commitActiveBlock, reportAsyncError]);
    const handleEditorBlurRef = useLatestRef(handleEditorBlur);

    const commitAndBlurActiveBlock = useCallback(() => {
      const activeBlockIdValue = activeBlockIdRef.current;
      if (!activeBlockIdValue) {
        return false;
      }

      commitActiveBlock({ updateReactState: true }).then(() => {
        if (activeBlockIdRef.current !== activeBlockIdValue) {
          return;
        }
        activeInputRef.current?.blur();
        nativeEditingBlockIdRef.current = null;
        clearOverlayFrame();
        activeBlockSnapshotRef.current = undefined;
        activeBlockIdRef.current = null;
        setActiveBlockId(null);
        setActiveActivationMode("programmatic");
        setActiveSelection(0);
        clearTextSelectionAnchor();
        clearTypingHistoryGroup();
      }).catch(reportAsyncError);

      return true;
    }, [clearOverlayFrame, clearTextSelectionAnchor, clearTypingHistoryGroup, commitActiveBlock, reportAsyncError]);

    const loadSelectedBlockMarkdown = useCallback(async (selection: BlockSelectionState) => {
      const anchorIndex = getBlockIndexById(selection.anchorBlockId);
      const focusIndex = getBlockIndexById(selection.focusBlockId);
      if (anchorIndex < 0 || focusIndex < 0) {
        return null;
      }

      const startIndex = Math.min(anchorIndex, focusIndex);
      const endIndex = Math.max(anchorIndex, focusIndex);
      const startBlockId = getBlockIdAtIndex(startIndex);
      const endBlockId = getBlockIdAtIndex(endIndex);
      if (!startBlockId || !endBlockId) {
        return null;
      }

      const blocks = await loadBlocksForRange(startIndex, endIndex - startIndex + 1);
      if (blocks.length !== endIndex - startIndex + 1) {
        return null;
      }

      return {
        endBlockId,
        endIndex,
        markdown: blocks.map((block) => block.markdown).join("\n\n"),
        startBlockId,
        startIndex,
      };
    }, [getBlockIdAtIndex, getBlockIndexById, loadBlocksForRange]);

    const replaceBlockSelection = useCallback(
      async (markdown: string) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction || !blockSelection) {
          return;
        }

        const selectedBlocks = await loadSelectedBlockMarkdown(blockSelection);
        if (!selectedBlocks) {
          return;
        }
        const nextBlockId = getBlockIdAtIndex(selectedBlocks.endIndex + 1);
        const previousBlockId = getBlockIdAtIndex(selectedBlocks.startIndex - 1);
        const nextBlock = await loadBlockAtIndex(nextBlockId, selectedBlocks.endIndex + 1);
        const previousBlock = await loadBlockAtIndex(previousBlockId, selectedBlocks.startIndex - 1);

        try {
          clearTypingHistoryGroup();
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "replaceBlockRange",
            startBlockId: selectedBlocks.startBlockId,
            endBlockId: selectedBlocks.endBlockId,
            markdown,
          });
          validateTransactionResult(result);
          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          if (!suppressHistoryRef.current) {
            let nextHistoryEntry: HistoryEntry | undefined;
            if (firstChangedBlockId) {
              if (lastChangedBlockId) {
                nextHistoryEntry = {
                  type: "replaceBlockRange" as const,
                  startBlockId: firstChangedBlockId,
                  endBlockId: lastChangedBlockId,
                  replacementMarkdown: selectedBlocks.markdown,
                  inverseMarkdown: markdown,
                };
              }
            }
            if (!nextHistoryEntry) {
              if (nextBlock) {
                nextHistoryEntry = {
                  type: "replaceBlockRange" as const,
                  startBlockId: nextBlock.id,
                  endBlockId: nextBlock.id,
                  replacementMarkdown: `${selectedBlocks.markdown}\n\n${nextBlock.markdown}`,
                  inverseMarkdown: nextBlock.markdown,
                };
              } else if (previousBlock) {
                nextHistoryEntry = {
                  type: "replaceBlockRange" as const,
                  startBlockId: previousBlock.id,
                  endBlockId: previousBlock.id,
                  replacementMarkdown: `${previousBlock.markdown}\n\n${selectedBlocks.markdown}`,
                  inverseMarkdown: previousBlock.markdown,
                };
              }
            }

            if (nextHistoryEntry) {
              undoStackRef.current.push(nextHistoryEntry);
              redoStackRef.current = [];
              publishCommandState();
            }
          }
          applyTransactionResult(result);
          blockSelectionGestureRef.current = null;
          setNextBlockSelection(null);
          const nextActiveBlock = result.changedBlocks[0];
          if (nextActiveBlock) {
            const nextSelection = Math.min(markdown.length, nextActiveBlock.markdown.length);
            activeBlockSnapshotRef.current = nextActiveBlock;
            activeBlockIdRef.current = nextActiveBlock.id;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveActivationMode("programmatic");
            setActiveSelection(nextSelection);
            setActiveBlockId(nextActiveBlock.id);
          }
          markDirty();
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        blockSelection,
        clearTypingHistoryGroup,
        documentState,
        getBlockIdAtIndex,
        loadBlockAtIndex,
        loadSelectedBlockMarkdown,
        markDirty,
        onErrorRef,
        publishCommandState,
        validateTransactionResult,
      ],
    );

    const replaceActiveBlockMarkdown = useCallback(
      async (markdown: string) => {
        const activeBlockIdValue = activeBlockIdRef.current;
        if (documentState.status !== "loaded" || !adapter.applyTransaction || !activeBlockIdValue) {
          return;
        }

        try {
          const beforeMarkdown = draftMarkdownRef.current;
          if (markdown === beforeMarkdown) {
            return;
          }
          updateRenderedBlockMarkdown(activeBlockIdValue, markdown);
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "updateBlockMarkdown",
            blockId: activeBlockIdValue,
            markdown,
          });
          validateTransactionResult(result);

          pushUpdateBlockHistoryEntry({
            type: "updateBlockMarkdown",
            blockId: activeBlockIdValue,
            beforeMarkdown,
            afterMarkdown: markdown,
          });

          applyTransactionResult(result);
          let nextActiveBlock: MarkdownBlockSnapshot | undefined = result.changedBlocks[0];
          if (!nextActiveBlock) {
            nextActiveBlock = activeBlockSnapshotRef.current?.id === activeBlockIdValue
              ? activeBlockSnapshotRef.current
              : undefined;
          }
          if (nextActiveBlock) {
            activeBlockSnapshotRef.current = nextActiveBlock;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            activeBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveActivationMode("programmatic");
            setActiveBlockId(nextActiveBlock.id);
            setActiveSelection(0);
            const activeInput = activeInputRef.current;
            if (activeInput) {
              activeInput.setValue(activeInputMarkdownForBlock(nextActiveBlock, nextActiveBlock.markdown));
              activeInput.setSelection(0, 0);
            }
          }
          markDirty();
        } catch (error) {
          updateRenderedBlockMarkdown(activeBlockIdValue, committedMarkdownRef.current);
          draftMarkdownRef.current = committedMarkdownRef.current;
          setDraftMarkdown(committedMarkdownRef.current);
          activeInputRef.current?.setValue(activeInputMarkdownForBlock(activeBlockSnapshotRef.current, committedMarkdownRef.current));
          setActiveActivationMode("programmatic");
          setActiveSelection(Math.min(activeInputSelectionRef.current.start, committedMarkdownRef.current.length));
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        documentState,
        markDirty,
        onErrorRef,
        pushUpdateBlockHistoryEntry,
        updateRenderedBlockMarkdown,
        validateTransactionResult,
      ],
    );

    const mergeActiveBlockIntoPrevious = useCallback(
      async (block: MarkdownBlockSnapshot) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return;
        }

        const blockIndex = getBlockIndexById(block.id);
        const previousBlockId = getBlockIdAtIndex(blockIndex - 1);
        const previousBlock = await loadBlockAtIndex(previousBlockId, blockIndex - 1);
        if (blockIndex <= 0 || !previousBlock) {
          return;
        }

        const currentMarkdown = draftMarkdownRef.current;
        const previousMarkdown = previousBlock.markdown;
        const mergedMarkdown = `${previousMarkdown}${currentMarkdown}`;
        const originalRangeMarkdown = `${previousMarkdown}\n\n${currentMarkdown}`;
        const joinSelection = previousMarkdown.length;
        const pendingMerge = {
          currentMarkdown,
          mergedMarkdown,
          previousMarkdown,
          sourceBlockId: block.id,
        };
        pendingMergeRef.current = pendingMerge;

        try {
          clearTypingHistoryGroup();
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "replaceBlockRange",
            startBlockId: previousBlock.id,
            endBlockId: block.id,
            markdown: mergedMarkdown,
          });
          validateTransactionResult(result);
          applyTransactionResult(result);

          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          if (!suppressHistoryRef.current && firstChangedBlockId && lastChangedBlockId) {
            undoStackRef.current.push({
              type: "replaceBlockRange",
              startBlockId: firstChangedBlockId,
              endBlockId: lastChangedBlockId,
              replacementMarkdown: originalRangeMarkdown,
              inverseMarkdown: mergedMarkdown,
            });
            redoStackRef.current = [];
            publishCommandState();
          }

          const nextActiveBlock = result.changedBlocks[0];
          if (nextActiveBlock) {
            const pendingMergedMarkdown = pendingMergeRef.current === pendingMerge
              ? pendingMerge.mergedMarkdown
              : mergedMarkdown;
            if (pendingMergeRef.current === pendingMerge) {
              pendingMergeRef.current = null;
            }
            const nextSelection = Math.min(joinSelection, nextActiveBlock.markdown.length);
            activeBlockSnapshotRef.current = nextActiveBlock;
            activeBlockIdRef.current = nextActiveBlock.id;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            activeInputSelectionRef.current = { start: nextSelection, end: nextSelection };
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveActivationMode("programmatic");
            setActiveSelection(nextSelection);
            setActiveBlockId(nextActiveBlock.id);

            if (pendingMergedMarkdown !== nextActiveBlock.markdown) {
              updateRenderedBlockMarkdown(nextActiveBlock.id, pendingMergedMarkdown);
              const updateResult = await adapter.applyTransaction(documentState.snapshot.documentId, {
                type: "updateBlockMarkdown",
                blockId: nextActiveBlock.id,
                markdown: pendingMergedMarkdown,
              });
              validateTransactionResult(updateResult);
              pushUpdateBlockHistoryEntry({
                type: "updateBlockMarkdown",
                blockId: nextActiveBlock.id,
                beforeMarkdown: nextActiveBlock.markdown,
                afterMarkdown: pendingMergedMarkdown,
              });
              applyTransactionResult(updateResult);

              const updatedActiveBlock = updateResult.changedBlocks[0];
              if (updatedActiveBlock) {
                const updatedSelection = Math.min(joinSelection, updatedActiveBlock.markdown.length);
                activeBlockSnapshotRef.current = updatedActiveBlock;
                draftMarkdownRef.current = updatedActiveBlock.markdown;
                committedMarkdownRef.current = updatedActiveBlock.markdown;
                activeInputSelectionRef.current = { start: updatedSelection, end: updatedSelection };
                setDraftMarkdown(updatedActiveBlock.markdown);
                setActiveSelection(updatedSelection);
                const activeInput = activeInputRef.current;
                if (activeInput) {
                  activeInput.setValue(activeInputMarkdownForBlock(updatedActiveBlock, updatedActiveBlock.markdown));
                  activeInput.setSelection(updatedSelection, updatedSelection);
                }
              }
            }
          }
          markDirty();
        } catch (error) {
          if (pendingMergeRef.current === pendingMerge) {
            pendingMergeRef.current = null;
          }
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        clearTypingHistoryGroup,
        documentState,
        getBlockIdAtIndex,
        getBlockIndexById,
        loadBlockAtIndex,
        markDirty,
        onErrorRef,
        publishCommandState,
        pushUpdateBlockHistoryEntry,
        updateRenderedBlockMarkdown,
        validateTransactionResult,
      ],
    );

    const handleNativeBackspaceAtStart = useCallback(
      (event: NativeBackspaceAtStartEvent) => {
        const activeBlock = activeBlockSnapshotRef.current;
        if (activeBlock && activeBlock.id === event.nativeEvent.blockId) {
          if (activeBlock.type === "heading") {
            const headingLevel = activeBlock.headingLevel;
            const markdown = headingLevel > 1
              ? setHeadingMarkdown(draftMarkdownRef.current, (headingLevel - 1) as HeadingLevel)
              : setParagraphMarkdown(draftMarkdownRef.current);
            replaceActiveBlockMarkdown(markdown).catch(reportAsyncError);
          } else {
            mergeActiveBlockIntoPrevious(activeBlock).catch(reportAsyncError);
          }
        }
      },
      [mergeActiveBlockIntoPrevious, replaceActiveBlockMarkdown, reportAsyncError],
    );

    const handleNativeEnterPressed = useCallback(
      (event: NativeEnterPressedEvent) => {
        const activeBlock = activeBlockSnapshotRef.current;
        const { afterMarkdown, beforeMarkdown, blockId } = event.nativeEvent;
        if (activeBlock && activeBlock.id === blockId) {
          const markdown = draftMarkdownRef.current;
          if (activeBlock.type !== "codeBlock" && !isFencedCodeMarkdown(markdown)) {
            const continuationMarkdown = getSplitContinuationMarkdown(beforeMarkdown, afterMarkdown);
            splitActiveBlock(
              activeBlock,
              continuationMarkdown.beforeMarkdown ?? beforeMarkdown,
              continuationMarkdown.afterMarkdown,
            ).catch(reportAsyncError);
          }
        }
      },
      [reportAsyncError, splitActiveBlock],
    );

    const formatCurrentBlockRange = useCallback(
      (transform: (markdown: string) => string) => {
        async function runFormat() {
          if (blockSelection) {
            const selectedBlocks = await loadSelectedBlockMarkdown(blockSelection);
            if (selectedBlocks) {
              await replaceBlockSelection(transform(selectedBlocks.markdown));
            }
            return;
          }

          if (activeBlockIdRef.current) {
            await replaceActiveBlockMarkdown(transform(draftMarkdownRef.current));
          }
        }

        runFormat().catch(reportAsyncError);
      },
      [
        blockSelection,
        loadSelectedBlockMarkdown,
        replaceActiveBlockMarkdown,
        replaceBlockSelection,
        reportAsyncError,
      ],
    );

    const applyMoveBlockRange = useCallback(
      async ({
        endBlockId,
        placement,
        startBlockId,
        targetBlockId,
      }: {
        endBlockId: string;
        placement: "before" | "after";
        startBlockId: string;
        targetBlockId: string;
      }) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return;
        }

        const firstIndex = getBlockIndexById(startBlockId);
        const secondIndex = getBlockIndexById(endBlockId);
        const targetIndex = getBlockIndexById(targetBlockId);
        if (firstIndex < 0 || secondIndex < 0 || targetIndex < 0) {
          return;
        }

        const rangeStartIndex = Math.min(firstIndex, secondIndex);
        const rangeEndIndex = Math.max(firstIndex, secondIndex);
        if (targetIndex >= rangeStartIndex && targetIndex <= rangeEndIndex) {
          return;
        }

        const previousBlockId = getBlockIdAtIndex(rangeStartIndex - 1);
        const nextBlockId = getBlockIdAtIndex(rangeEndIndex + 1);
        const inverseTargetBlockId = previousBlockId ?? nextBlockId;
        const inversePlacement = previousBlockId ? "after" : "before";
        if (!inverseTargetBlockId) {
          return;
        }

        try {
          clearTypingHistoryGroup();
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "moveBlockRange",
            startBlockId,
            endBlockId,
            targetBlockId,
            placement,
          });
          validateTransactionResult(result);
          applyTransactionResult(result);
          const nextBlockSelection = blockSelectionRef.current;
          blockSelectionGestureRef.current = null;
          setNextBlockSelection(nextBlockSelection);
          if (!suppressHistoryRef.current) {
            undoStackRef.current.push({
              type: "moveBlockRange",
              startBlockId,
              endBlockId,
              targetBlockId: inverseTargetBlockId,
              placement: inversePlacement,
              inverseTargetBlockId: targetBlockId,
              inversePlacement: placement,
            });
            redoStackRef.current = [];
            publishCommandState();
          }

          const activeBlockIdValue = activeBlockIdRef.current;
          let nextActiveBlock: MarkdownBlockSnapshot | undefined;
          if (activeBlockIdValue) {
            nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue);
          }
          if (nextActiveBlock) {
            activeBlockSnapshotRef.current = nextActiveBlock;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveActivationMode("programmatic");
            setActiveSelection(Math.min(activeInputSelectionRef.current.start, nextActiveBlock.markdown.length));
            setActiveBlockId(nextActiveBlock.id);
          }
          markDirty();
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        clearTypingHistoryGroup,
        documentState,
        getBlockIdAtIndex,
        getBlockIndexById,
        markDirty,
        onErrorRef,
        publishCommandState,
        setNextBlockSelection,
        validateTransactionResult,
      ],
    );

    const moveActiveBlock = useCallback(
      (direction: "up" | "down") => {
        async function runMove() {
          await commitActiveBlock({ updateReactState: true });
          const currentBlockSelection = blockSelectionRef.current;
          if (currentBlockSelection) {
            const anchorIndex = getBlockIndexById(currentBlockSelection.anchorBlockId);
            const focusIndex = getBlockIndexById(currentBlockSelection.focusBlockId);
            if (anchorIndex >= 0 && focusIndex >= 0) {
              const rangeStartIndex = Math.min(anchorIndex, focusIndex);
              const rangeEndIndex = Math.max(anchorIndex, focusIndex);
              const targetBlockId = direction === "up"
                ? getBlockIdAtIndex(rangeStartIndex - 1)
                : getBlockIdAtIndex(rangeEndIndex + 1);
              if (targetBlockId) {
                await applyMoveBlockRange({
                  endBlockId: getBlockIdAtIndex(rangeEndIndex)!,
                  placement: direction === "up" ? "before" : "after",
                  startBlockId: getBlockIdAtIndex(rangeStartIndex)!,
                  targetBlockId,
                });
              }
            }
          } else {
            const activeBlockIdValue = activeBlockIdRef.current;
            if (!activeBlockIdValue) {
              return;
            }

            const activeBlockIndex = getBlockIndexById(activeBlockIdValue);
            const targetBlockId = getBlockIdAtIndex(direction === "up" ? activeBlockIndex - 1 : activeBlockIndex + 1);
            if (targetBlockId) {
              await applyMoveBlockRange({
                endBlockId: activeBlockIdValue,
                placement: direction === "up" ? "before" : "after",
                startBlockId: activeBlockIdValue,
                targetBlockId,
              });
            }
          }
        }

        runMove().catch(reportAsyncError);
      },
      [applyMoveBlockRange, commitActiveBlock, getBlockIdAtIndex, getBlockIndexById, reportAsyncError],
    );

    const focusAdjacentBlock = useCallback(
      (direction: "up" | "down", options?: { preferredX?: number }) => {
        focusAdjacentBlockQueueRef.current.push({ direction, preferredX: options?.preferredX });
        if (!focusAdjacentBlockInFlightRef.current) {
          focusAdjacentBlockInFlightRef.current = true;

          async function runQueuedFocus() {
            while (focusAdjacentBlockQueueRef.current.length > 0) {
              const request = focusAdjacentBlockQueueRef.current.shift();
              if (request) {
                commitActiveBlock({ updateReactState: true }).catch(reportAsyncError);
                const activeBlockIdValue = activeBlockIdRef.current;
                if (activeBlockIdValue) {
                  const activeBlockIndex = getBlockIndexById(activeBlockIdValue);
                  const targetBlockIndex = request.direction === "up" ? activeBlockIndex - 1 : activeBlockIndex + 1;
                  const targetBlockId = getBlockIdAtIndex(targetBlockIndex);
                  const targetBlock = await loadBlockAtIndex(targetBlockId, targetBlockIndex);
                  if (targetBlock) {
                    await prepareBlockIndexForKeyboardFocus(targetBlockIndex, request.direction);
                    const targetSelection = request.preferredX === undefined
                      ? Math.min(activeInputSelectionRef.current.start, targetBlock.markdown.length)
                      : request.direction === "up"
                        ? targetBlock.markdown.length
                        : 0;
                    blockSelectionGestureRef.current = null;
                    setNextBlockSelection(null);
                    clearTextSelectionAnchor();
                    if (request.preferredX !== undefined) {
                      pendingVerticalNavigationSelectionRef.current = {
                        blockId: targetBlock.id,
                        direction: request.direction,
                        preferredX: request.preferredX,
                      };
                    }
                    setActiveBlock(targetBlock, targetSelection);
                    scrollBlockIntoView(targetBlock);
                  }
                }
              }
            }
          }

          runQueuedFocus()
            .catch(reportAsyncError)
            .finally(() => {
              focusAdjacentBlockInFlightRef.current = false;
            });
        }
      },
      [
        clearTextSelectionAnchor,
        commitActiveBlock,
        getBlockIdAtIndex,
        getBlockIndexById,
        loadBlockAtIndex,
        prepareBlockIndexForKeyboardFocus,
        reportAsyncError,
        scrollBlockIntoView,
        setActiveBlock,
        setNextBlockSelection,
      ],
    );

    const handleVerticalNavigationOutside = useCallback(
      (_blockId: string, event: VerticalNavigationOutsideEvent) => {
        if ((event.direction === "up" || event.direction === "down") && Number.isFinite(event.preferredX)) {
          focusAdjacentBlock(event.direction, { preferredX: event.preferredX });
        }
      },
      [focusAdjacentBlock],
    );
    const handleVerticalNavigationOutsideRef = useLatestRef(handleVerticalNavigationOutside);

    const focusBoundaryBlock = useCallback(
      (direction: "up" | "down") => {
        async function runFocus() {
          await commitActiveBlock({ updateReactState: true });
          const blockCount = getBlockCount();
          const targetBlockId = direction === "up"
            ? getBlockIdAtIndex(0)
            : getBlockIdAtIndex(blockCount - 1);
          const targetBlockIndex = direction === "up" ? 0 : blockCount - 1;
          const targetBlock = await loadBlockAtIndex(targetBlockId, targetBlockIndex);
          if (targetBlock) {
            const targetSelection = Math.min(activeInputSelectionRef.current.start, targetBlock.markdown.length);
            blockSelectionGestureRef.current = null;
            setNextBlockSelection(null);
            clearTextSelectionAnchor();
            setActiveBlock(targetBlock, targetSelection);
            scrollBlockIntoView(targetBlock);
          }
        }

        runFocus().catch(reportAsyncError);
      },
      [clearTextSelectionAnchor, commitActiveBlock, getBlockCount, getBlockIdAtIndex, loadBlockAtIndex, reportAsyncError, scrollBlockIntoView, setActiveBlock, setNextBlockSelection],
    );

    const setKeyboardBlockSelection = useCallback((anchorBlockId: string, focusBlockId: string) => {
      activeInputRef.current?.blur?.();
      nativeEditingBlockIdRef.current = null;
      clearOverlayFrame();
      activeBlockSnapshotRef.current = undefined;
      activeBlockIdRef.current = null;
      blockSelectionGestureRef.current = null;
      clearTextSelectionAnchor();
      setActiveBlockId(null);
      setActiveActivationMode("programmatic");
      setActiveSelection(0);
      setNextBlockSelection({ anchorBlockId, focusBlockId });
    }, [clearOverlayFrame, clearTextSelectionAnchor, setNextBlockSelection]);

    const extendBlockSelection = useCallback(
      (direction: "up" | "down") => {
        const currentBlockSelection = blockSelectionRef.current;
        if (currentBlockSelection) {
          const focusIndex = getBlockIndexById(currentBlockSelection.focusBlockId);
          const nextFocusBlockId = getBlockIdAtIndex(direction === "up" ? focusIndex - 1 : focusIndex + 1);
          if (focusIndex >= 0 && nextFocusBlockId) {
            setNextBlockSelection({
              anchorBlockId: currentBlockSelection.anchorBlockId,
              focusBlockId: nextFocusBlockId,
            });
          }
          return true;
        }

        const activeBlockIdValue = activeBlockIdRef.current;
        const activeBlockIndex = getBlockIndexById(activeBlockIdValue);
        const selection = activeInputSelectionRef.current;
        const selectionStart = Math.min(selection.start, selection.end);
        const selectionEnd = Math.max(selection.start, selection.end);
        const isAtSelectionBoundary = direction === "up"
          ? selectionStart === 0
          : selectionEnd === draftMarkdownRef.current.length;
        const targetBlockId = getBlockIdAtIndex(direction === "up" ? activeBlockIndex - 1 : activeBlockIndex + 1);
        if (activeBlockIdValue && activeBlockIndex >= 0 && isAtSelectionBoundary && targetBlockId) {
          const shouldCommitBeforeSelecting = (
            draftMarkdownRef.current !== committedMarkdownRef.current ||
            pendingRenderTransactionRef.current !== undefined
          );
          if (!shouldCommitBeforeSelecting) {
            setKeyboardBlockSelection(activeBlockIdValue, targetBlockId);
            return true;
          }

          async function runExtendSelection() {
            await commitActiveBlock({ updateReactState: true });
            const nextActiveBlockId = activeBlockIdRef.current;
            const nextActiveBlockIndex = getBlockIndexById(nextActiveBlockId);
            const nextFocusBlockId = getBlockIdAtIndex(
              direction === "up" ? nextActiveBlockIndex - 1 : nextActiveBlockIndex + 1,
            );
            if (nextActiveBlockId && nextActiveBlockIndex >= 0 && nextFocusBlockId) {
              setKeyboardBlockSelection(nextActiveBlockId, nextFocusBlockId);
            }
          }

          runExtendSelection().catch(reportAsyncError);
          return true;
        }

        return false;
      },
      [commitActiveBlock, getBlockIdAtIndex, getBlockIndexById, reportAsyncError, setKeyboardBlockSelection, setNextBlockSelection],
    );

    const runActiveInputCommand = useCallback((command: () => void) => {
      const input = activeInputRef.current;
      if (!input) {
        return;
      }

      const selection = activeInputSelectionRef.current;
      const activeBlock = activeBlockSnapshotRef.current;
      input.focus();
      input.setSelection(
        activeInputSelectionForBlock(activeBlock, selection.start, draftMarkdownRef.current),
        activeInputSelectionForBlock(activeBlock, selection.end, draftMarkdownRef.current),
      );
      command();
    }, []);

    const handleBlockSelectionKeyPress = useCallback(
      (event: { nativeEvent: { key: string } }) => {
        if (!blockSelection) {
          return;
        }

        const { key } = event.nativeEvent;
        if (key === "Backspace" || key === "Delete" || key === "Enter") {
          replaceBlockSelection("").catch(reportAsyncError);
        }
      },
      [blockSelection, replaceBlockSelection, reportAsyncError],
    );

    const handleBlockSelectionInputChange = useCallback(
      (text: string) => {
        blockSelectionInputText$.set("");
        if (blockSelection && text.length > 0) {
          replaceBlockSelection(text).catch(reportAsyncError);
        }
      },
      [blockSelection, blockSelectionInputText$, replaceBlockSelection, reportAsyncError],
    );

    const hydrateRemainingBlocks = useCallback(
      (snapshot: MarkdownDocumentSnapshot, loadVersion: number) => {
        cancelHydration();

        let startIndex = snapshot.initialBlocks.length;
        const requestRevision = currentRevisionRef.current;
        const hydrateNextChunk = () => {
          hydrateFrameRef.current = undefined;
          if (loadVersion !== loadVersionRef.current || requestRevision !== currentRevisionRef.current || startIndex >= snapshot.blockCount) {
            return;
          }

          const count = Math.min(hydrateChunkSize, snapshot.blockCount - startIndex);
          const hydrateRequest = adapter.getBlockMetadata
            ? adapter.getBlockMetadata(snapshot.documentId, startIndex, count)
            : adapter.getBlocks(snapshot.documentId, startIndex, count);

          hydrateRequest
            .then((blocksOrIds) => {
              if (loadVersion !== loadVersionRef.current || requestRevision !== currentRevisionRef.current) {
                return;
              }

              const blocks = blocksOrIds as MarkdownBlockMetadata[];
              mergeBlocks(blocks, requestRevision);
              startIndex += blocks.length;

              if (blocksOrIds.length > 0 && startIndex < snapshot.blockCount) {
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
      cancelPendingVerticalNavigationFrame();
      clearAutosaveTimer();
      commitQueueRef.current = Promise.resolve();
      activeBlockIdRef.current = null;
      activeBlockSnapshotRef.current = undefined;
      if (activeRenderBlockIdRef.current) {
        documentRenderState$.activeBlocksById.get(activeRenderBlockIdRef.current).delete();
        activeRenderBlockIdRef.current = null;
      }
      commentAnchorBlockIdRef.current = null;
      selectedRenderBlockIdsRef.current.forEach((blockId) => {
        documentRenderState$.selectedBlocksById.get(blockId).delete();
      });
      selectedRenderBlockIdsRef.current = new Set();
      draftMarkdownRef.current = "";
      committedMarkdownRef.current = "";
      currentRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      isDirtyRef.current = false;
      pendingRenderTransactionRef.current = undefined;
      autosavePausedRef.current = false;
      loadedSnapshotRef.current = null;
      undoStackRef.current = [];
      redoStackRef.current = [];
      publishCommandState();
      suppressHistoryRef.current = false;
      clearTypingHistoryGroup();
      blockSelectionGestureRef.current = null;
      activeInputSelectionRef.current = { start: 0, end: 0 };
      selectionAnchorRequestRef.current += 1;
      nativeEditingBlockIdRef.current = null;
      pendingVerticalNavigationSelectionRef.current = null;
      clearOverlayFrame();
      blockDataSourceRef.current = null;
      setBlockDataSource(null);
      setBlockDataRevision(0);
      setDocumentState({ status: "loading" });
      documentRenderState$.rowStatesById.set(new Map());
      setActiveBlockId(null);
      setActiveActivationMode("programmatic");
      setActiveSelection(0);
      setNextBlockSelection(null);
      blockSelectionInputText$.set("");
      setDraftMarkdown("");
      publishTextSelectionAnchor(null);
      setNextSaveState("idle");
      onDirtyChangeRef.current?.(false);

      adapter
        .load(filename)
        .then(async (snapshot) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            adapter.close(snapshot.documentId).catch(reportAsyncError);
            return;
          }

          const hasIndexedBlockAccess = !!adapter.getBlockIdAtIndexSync && !!adapter.getBlockIndexForIdSync;
          const allBlockIds = !hasIndexedBlockAccess && adapter.getBlockIds
            ? await adapter.getBlockIds(snapshot.documentId, 0, snapshot.blockCount)
            : undefined;
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            adapter.close(snapshot.documentId).catch(reportAsyncError);
            return;
          }

          if (allBlockIds && allBlockIds.length !== snapshot.blockCount) {
            throw new Error(`Markdown adapter returned ${allBlockIds.length} block ids for ${snapshot.blockCount} blocks.`);
          }

          const nextBlockDataSource = new MarkdownBlockDataSource(
            adapter,
            snapshot.documentId,
            snapshot,
            allBlockIds,
          );
          loadedSnapshotRef.current = snapshot;
          blockDataSourceRef.current = nextBlockDataSource;
          setBlockDataSource(nextBlockDataSource);
          setBlockDataRevision(nextBlockDataSource.getRevision());
          setDocumentState({ status: "loaded", snapshot });
          if (autoFocusFirstBlock) {
            const firstBlock = snapshot.initialBlocks[0];
            if (firstBlock) {
              activeBlockIdRef.current = firstBlock.id;
              nativeEditingBlockIdRef.current = firstBlock.id;
              setActiveActivationMode("programmatic");
              setActiveSelection(0);
              setActiveBlockId(firstBlock.id);
              if (isMarkdownBlockSnapshot(firstBlock)) {
                setActiveBlock(firstBlock, 0);
              } else {
                adapter.getBlock(snapshot.documentId, firstBlock.id)
                  .then((block) => {
                    if (!isCanceled && loadVersion === loadVersionRef.current && activeBlockIdRef.current === block.id) {
                      setActiveBlock(block, 0);
                    }
                  })
                  .catch(reportAsyncError);
              }
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
          loadedSnapshotRef.current = null;
          setDocumentState({ status: "error", error: nextError });
          onLoadErrorRef.current?.(nextError);
          onErrorRef.current?.(nextError);
        });

      return () => {
        isCanceled = true;
        cancelHydration();
        cancelPendingVerticalNavigationFrame();
        clearAutosaveTimer();
      };
    }, [
      adapter,
      cancelHydration,
      cancelPendingVerticalNavigationFrame,
      clearAutosaveTimer,
      clearOverlayFrame,
      autoFocusFirstBlock,
      documentRenderState$,
      filename,
      reloadVersion,
      onDirtyChangeRef,
      onErrorRef,
      onLoadErrorRef,
      onLoadedRef,
      publishCommandState,
      reportAsyncError,
      setActiveBlock,
      setNextSaveState,
      clearTypingHistoryGroup,
    ]);

    const loadedDocumentId = documentState.status === "loaded" ? documentState.snapshot.documentId : undefined;
    useEffect(() => {
      if (!blockSelection) {
        return;
      }
      if (activeBlockIdRef.current) {
        return;
      }

      const timeout = setTimeout(() => {
        blockSelectionInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timeout);
    }, [blockSelection]);

    useEffect(() => {
      if (!loadedDocumentId) {
        return undefined;
      }

      return () => {
        adapter.close(loadedDocumentId).catch(reportAsyncError);
      };
    }, [adapter, loadedDocumentId, reportAsyncError]);

    const saveDocument = useCallback(
      async (saveFilename?: string) => {
        while (saveInFlightRef.current) {
          try {
            await saveInFlightRef.current;
          } catch {
            // A fresh explicit save should get a chance to retry after a failed in-flight save.
          }
        }

        if (documentState.status !== "loaded") {
          return;
        }
        const { documentId } = documentState.snapshot;

        clearAutosaveTimer();
        autosavePausedRef.current = false;
        setNextSaveState("saving");

        async function performSave() {
          await commitActiveBlock({ updateReactState: false });
          if (saveFilename) {
            await adapter.saveAs(documentId, saveFilename);
          } else {
            await adapter.save(documentId);
          }
          savedRevisionRef.current = currentRevisionRef.current;
          setNextSaveState("idle");
          isDirtyRef.current = currentRevisionRef.current !== savedRevisionRef.current;
          onDirtyChangeRef.current?.(isDirtyRef.current);
        }

        const savePromise = performSave();
        saveInFlightRef.current = savePromise;

        try {
          await savePromise;
          if (saveInFlightRef.current === savePromise) {
            saveInFlightRef.current = undefined;
          }
        } catch (error: unknown) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          autosavePausedRef.current = true;
          setNextSaveState("error");
          onErrorRef.current?.(nextError);
          if (saveInFlightRef.current === savePromise) {
            saveInFlightRef.current = undefined;
          }
          throw nextError;
        }
      },
      [
        adapter,
        clearAutosaveTimer,
        commitActiveBlock,
        documentState,
        onDirtyChangeRef,
        onErrorRef,
        setNextSaveState,
      ],
    );

    const save = useCallback(async () => {
      if (documentState.status !== "loaded") {
        return;
      }

      await saveDocument();
    }, [documentState.status, saveDocument]);

    const saveAs = useCallback(async (saveFilename: string) => {
      if (documentState.status !== "loaded") {
        return;
      }

      await saveDocument(saveFilename);
    }, [documentState.status, saveDocument]);

    const reload = useCallback(() => {
      setReloadVersion((version) => version + 1);
    }, []);

    useEffect(() => {
      saveRef.current = save;
      return () => {
        if (saveRef.current === save) {
          saveRef.current = undefined;
        }
      };
    }, [save]);

    const applyHistoryEntry = useCallback(
      async (entry: HistoryEntry) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return null;
        }

        suppressHistoryRef.current = true;
        const finishHistoryEntry = (nextEntry: HistoryEntry | null) => {
          suppressHistoryRef.current = false;
          return nextEntry;
        };
        try {
          if (entry.type === "updateBlockMarkdown") {
            const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
              type: "updateBlockMarkdown",
              blockId: entry.blockId,
              markdown: entry.beforeMarkdown,
            });
            applyTransactionResult(result);
            if (activeBlockIdRef.current === entry.blockId) {
              nativeEditingBlockIdRef.current = entry.blockId;
              draftMarkdownRef.current = entry.beforeMarkdown;
              committedMarkdownRef.current = entry.beforeMarkdown;
              setDraftMarkdown(entry.beforeMarkdown);
              const activeInput = activeInputRef.current;
              if (activeInput) {
                activeInput.setValue(activeInputMarkdownForBlock(activeBlockSnapshotRef.current, entry.beforeMarkdown));
              }
            }
            markDirty();
            return finishHistoryEntry({
              type: "updateBlockMarkdown",
              blockId: entry.blockId,
              beforeMarkdown: entry.afterMarkdown,
              afterMarkdown: entry.beforeMarkdown,
            } satisfies HistoryEntry);
          }

          if (entry.type === "splitBlock") {
            const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
              type: "splitBlock",
              blockId: entry.blockId,
              beforeMarkdown: entry.beforeMarkdown,
              afterMarkdown: entry.afterMarkdown,
            });
            applyTransactionResult(result);
            blockSelectionGestureRef.current = null;
            setNextBlockSelection(null);

            const firstChangedBlockId = result.changedRange.blockIds[0];
            const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
            let nextActiveBlockId = result.changedRange.blockIds[1];
            if (!nextActiveBlockId) {
              nextActiveBlockId = result.changedRange.blockIds[0];
            }
            const nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === nextActiveBlockId);
            if (nextActiveBlock) {
              activeBlockSnapshotRef.current = nextActiveBlock;
              activeBlockIdRef.current = nextActiveBlock.id;
              nativeEditingBlockIdRef.current = nextActiveBlock.id;
              draftMarkdownRef.current = nextActiveBlock.markdown;
              committedMarkdownRef.current = nextActiveBlock.markdown;
              setDraftMarkdown(nextActiveBlock.markdown);
              setActiveActivationMode("programmatic");
              setActiveSelection(nextActiveBlock.markdown.length);
              setActiveBlockId(nextActiveBlock.id);
            }
            markDirty();
            if (!firstChangedBlockId) {
              return finishHistoryEntry(null);
            }
            if (!lastChangedBlockId) {
              return finishHistoryEntry(null);
            }
            return finishHistoryEntry({
              type: "replaceBlockRange",
              startBlockId: firstChangedBlockId,
              endBlockId: lastChangedBlockId,
              replacementMarkdown: entry.replacementMarkdown,
              inverseMarkdown: `${entry.beforeMarkdown}\n\n${entry.afterMarkdown}`,
              inverseSplit: {
                afterMarkdown: entry.afterMarkdown,
                beforeMarkdown: entry.beforeMarkdown,
              },
            } satisfies HistoryEntry);
          }

          if (entry.type === "moveBlockRange") {
            const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
              type: "moveBlockRange",
              startBlockId: entry.startBlockId,
              endBlockId: entry.endBlockId,
              targetBlockId: entry.targetBlockId,
              placement: entry.placement,
            });
            applyTransactionResult(result);
            const nextBlockSelection = blockSelectionRef.current;
            blockSelectionGestureRef.current = null;
            setNextBlockSelection(nextBlockSelection);
            const activeBlockIdValue = activeBlockIdRef.current;
            let nextActiveBlock: MarkdownBlockSnapshot | undefined;
            if (activeBlockIdValue) {
              nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue);
            }
            if (nextActiveBlock) {
              activeBlockSnapshotRef.current = nextActiveBlock;
              nativeEditingBlockIdRef.current = nextActiveBlock.id;
              draftMarkdownRef.current = nextActiveBlock.markdown;
              committedMarkdownRef.current = nextActiveBlock.markdown;
              setDraftMarkdown(nextActiveBlock.markdown);
              setActiveActivationMode("programmatic");
              setActiveSelection(Math.min(activeInputSelectionRef.current.start, nextActiveBlock.markdown.length));
              setActiveBlockId(nextActiveBlock.id);
            }
            markDirty();
            return finishHistoryEntry({
              type: "moveBlockRange",
              startBlockId: entry.startBlockId,
              endBlockId: entry.endBlockId,
              targetBlockId: entry.inverseTargetBlockId,
              placement: entry.inversePlacement,
              inverseTargetBlockId: entry.targetBlockId,
              inversePlacement: entry.placement,
            } satisfies HistoryEntry);
          }

          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "replaceBlockRange",
            startBlockId: entry.startBlockId,
            endBlockId: entry.endBlockId,
            markdown: entry.replacementMarkdown,
          });
          applyTransactionResult(result);
          blockSelectionGestureRef.current = null;
          setNextBlockSelection(null);
          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          const firstChangedBlock = result.changedBlocks[0];
          if (firstChangedBlock) {
            activeBlockSnapshotRef.current = firstChangedBlock;
            activeBlockIdRef.current = firstChangedBlock.id;
            nativeEditingBlockIdRef.current = firstChangedBlock.id;
            draftMarkdownRef.current = firstChangedBlock.markdown;
            committedMarkdownRef.current = firstChangedBlock.markdown;
            setDraftMarkdown(firstChangedBlock.markdown);
            setActiveActivationMode("programmatic");
            setActiveSelection(0);
            setActiveBlockId(firstChangedBlock.id);
          }
          markDirty();
          if (!firstChangedBlockId) {
            return finishHistoryEntry(null);
          }
          if (!lastChangedBlockId) {
            return finishHistoryEntry(null);
          }
          if (entry.inverseSplit) {
            return finishHistoryEntry({
              type: "splitBlock",
              blockId: firstChangedBlockId,
              beforeMarkdown: entry.inverseSplit.beforeMarkdown,
              afterMarkdown: entry.inverseSplit.afterMarkdown,
              replacementMarkdown: entry.replacementMarkdown,
            } satisfies HistoryEntry);
          }
          return finishHistoryEntry({
            type: "replaceBlockRange",
            startBlockId: firstChangedBlockId,
            endBlockId: lastChangedBlockId,
            replacementMarkdown: entry.inverseMarkdown,
            inverseMarkdown: entry.replacementMarkdown,
          } satisfies HistoryEntry);
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
          return finishHistoryEntry(null);
        }
      },
      [adapter, applyTransactionResult, documentState, markDirty, onErrorRef],
    );

    const undo = useCallback(() => {
      async function runUndo() {
        clearTypingHistoryGroup();
        await commitActiveBlock({ updateReactState: true });
        const entry = undoStackRef.current.pop();
        if (!entry) {
          return;
        }

        const redoEntry = await applyHistoryEntry(entry);
        if (redoEntry) {
          redoStackRef.current.push(redoEntry);
        } else {
          undoStackRef.current.push(entry);
        }
        publishCommandState();
      }

      runUndo().catch(reportAsyncError);
    }, [applyHistoryEntry, clearTypingHistoryGroup, commitActiveBlock, publishCommandState, reportAsyncError]);

    const redo = useCallback(() => {
      async function runRedo() {
        clearTypingHistoryGroup();
        await commitActiveBlock({ updateReactState: true });
        const entry = redoStackRef.current.pop();
        if (!entry) {
          return;
        }

        const undoEntry = await applyHistoryEntry(entry);
        if (undoEntry) {
          undoStackRef.current.push(undoEntry);
        } else {
          redoStackRef.current.push(entry);
        }
        publishCommandState();
      }

      runRedo().catch(reportAsyncError);
    }, [applyHistoryEntry, clearTypingHistoryGroup, commitActiveBlock, publishCommandState, reportAsyncError]);

    const commands = useMemo<MarkdownDocumentCommands>(
      () => ({
        focus() {
          activeInputRef.current?.focus();
        },
        insertLink(options) {
          const selection = activeInputSelectionRef.current;
          const selectionStart = Math.min(selection.start, selection.end);
          const selectionEnd = Math.max(selection.start, selection.end);
          const selectedText = draftMarkdownRef.current.slice(selectionStart, selectionEnd);
          const text = options?.text ?? (selectedText.length > 0 ? selectedText : "Link");
          const url = (options?.url ?? "https://").trim();
          if (url.length > 0) {
            runActiveInputCommand(() => activeInputRef.current?.insertLink(text, url));
          }
        },
        invalidateLayoutMeasurements() {
          listRef.current?.clearCaches({ mode: "sizes" });
        },
        insertThematicBreak() {
          formatCurrentBlockRange(thematicBreakMarkdown);
        },
        extendBlockSelectionDown() {
          return extendBlockSelection("down");
        },
        extendBlockSelectionUp() {
          return extendBlockSelection("up");
        },
        focusFirstBlock() {
          focusBoundaryBlock("up");
        },
        focusLastBlock() {
          focusBoundaryBlock("down");
        },
        focusNextBlock() {
          focusAdjacentBlock("down");
        },
        focusPreviousBlock() {
          focusAdjacentBlock("up");
        },
        redo,
        reload,
        save,
        saveAs,
        commitAndBlurActiveBlock,
        moveActiveBlockDown() {
          moveActiveBlock("down");
        },
        moveActiveBlockUp() {
          moveActiveBlock("up");
        },
        setHeading(level: HeadingLevel) {
          formatCurrentBlockRange((markdown) => setHeadingMarkdown(markdown, level));
        },
        setParagraph() {
          formatCurrentBlockRange(setParagraphMarkdown);
        },
        toggleBold() {
          runActiveInputCommand(() => activeInputRef.current?.toggleBold());
        },
        toggleBlockquote() {
          formatCurrentBlockRange(toggleBlockquoteMarkdown);
        },
        toggleCodeBlock() {
          formatCurrentBlockRange(toggleCodeBlockMarkdown);
        },
        toggleItalic() {
          runActiveInputCommand(() => activeInputRef.current?.toggleItalic());
        },
        toggleOrderedList() {
          formatCurrentBlockRange(toggleOrderedListMarkdown);
        },
        toggleSpoiler() {
          runActiveInputCommand(() => activeInputRef.current?.toggleSpoiler());
        },
        toggleStrikethrough() {
          runActiveInputCommand(() => activeInputRef.current?.toggleStrikethrough());
        },
        toggleTaskList() {
          formatCurrentBlockRange(toggleTaskListMarkdown);
        },
        toggleUnderline() {
          runActiveInputCommand(() => activeInputRef.current?.toggleUnderline());
        },
        toggleUnorderedList() {
          formatCurrentBlockRange(toggleUnorderedListMarkdown);
        },
        undo,
      }),
      [
        commitAndBlurActiveBlock,
        extendBlockSelection,
        focusAdjacentBlock,
        focusBoundaryBlock,
        formatCurrentBlockRange,
        moveActiveBlock,
        redo,
        reload,
        runActiveInputCommand,
        save,
        saveAs,
        undo,
      ],
    );

    useImperativeHandle(ref, () => commands, [commands]);
    useImperativeHandle(commandsRef, () => commands, [commands]);

    useEffect(() => {
      if (blockDataSource) {
        return blockDataSource.subscribe(() => {
          if (blockSelectionRef.current) {
            setBlockDataRevision(blockDataSource.getRevision());
          }
        });
      }
      return undefined;
    }, [blockDataSource]);

    const selectedBlockIds = useMemo(() => {
      const selectedIds = new Set<string>();
      if (!blockSelection) {
        return selectedIds;
      }

      const anchorIndex = getBlockIndexById(blockSelection.anchorBlockId);
      const focusIndex = getBlockIndexById(blockSelection.focusBlockId);
      if (anchorIndex >= 0 && focusIndex >= 0) {
        const startIndex = Math.min(anchorIndex, focusIndex);
        const endIndex = Math.max(anchorIndex, focusIndex);
        for (let index = startIndex; index <= endIndex; index += 1) {
          const blockId = getBlockIdAtIndex(index);
          if (blockId) {
            selectedIds.add(blockId);
          }
        }
      }

      return selectedIds;
    }, [blockDataRevision, blockSelection, getBlockIdAtIndex, getBlockIndexById]);
    useEffect(() => {
      documentRenderState$.blockSelection.set(blockSelection);
    }, [blockSelection, documentRenderState$]);
    useLayoutEffect(() => {
      const previousActiveBlockId = activeRenderBlockIdRef.current;
      if (previousActiveBlockId && previousActiveBlockId !== activeBlockId) {
        documentRenderState$.activeBlocksById.get(previousActiveBlockId).delete();
        if (overlayFrameBlockIdRef.current === previousActiveBlockId) {
          clearOverlayFrame();
        }
      }
      const activeBlock = activeBlockId && activeBlockSnapshotRef.current?.id === activeBlockId
        ? activeBlockSnapshotRef.current
        : undefined;
      if (activeBlockId && activeBlock) {
        const previousRenderState = documentRenderState$.activeBlocksById.get(activeBlockId).peek();
        const pendingInitialEditorFrame = pendingInitialEditorFrameRef.current;
        const pendingEditorFrame = previousRenderState?.editorFrame ??
          (overlayFrameBlockIdRef.current === activeBlockId ? overlayFrameRef.current : undefined) ??
          (pendingInitialEditorFrame?.blockId === activeBlockId ? pendingInitialEditorFrame.frame : undefined);
        documentRenderState$.activeBlocksById.get(activeBlockId).set({
          activationMode: activeActivationMode,
          block: {
            ...activeBlock,
            markdown: draftMarkdown,
          },
          draftMarkdown,
          editorFrame: pendingEditorFrame,
          selection: activeSelection,
        });
        if (pendingInitialEditorFrame?.blockId === activeBlockId) {
          pendingInitialEditorFrameRef.current = undefined;
        }
        activeRenderBlockIdRef.current = activeBlockId;
      } else {
        activeRenderBlockIdRef.current = null;
      }
    }, [activeActivationMode, activeBlockId, activeSelection, clearOverlayFrame, documentRenderState$, draftMarkdown]);
    useEffect(() => {
      const previousSelectedBlockIds = selectedRenderBlockIdsRef.current;
      previousSelectedBlockIds.forEach((blockId) => {
        if (!selectedBlockIds.has(blockId)) {
          documentRenderState$.selectedBlocksById.get(blockId).delete();
        }
      });
      selectedBlockIds.forEach((blockId) => {
        if (!previousSelectedBlockIds.has(blockId)) {
          documentRenderState$.selectedBlocksById.get(blockId).set(true);
        }
      });
      selectedRenderBlockIdsRef.current = selectedBlockIds;
    }, [documentRenderState$, selectedBlockIds]);
    useEffect(() => {
      const previousCommentAnchorBlockId = commentAnchorBlockIdRef.current;
      const nextCommentAnchorBlockId = commentAnchor?.blockId ?? null;
      batch(() => {
        if (previousCommentAnchorBlockId && previousCommentAnchorBlockId !== nextCommentAnchorBlockId) {
          setBlockRowCommentAnchor(previousCommentAnchorBlockId, null);
        }
        if (nextCommentAnchorBlockId) {
          setBlockRowCommentAnchor(nextCommentAnchorBlockId, commentAnchor ?? null);
        }
      });
      commentAnchorBlockIdRef.current = nextCommentAnchorBlockId;
    }, [commentAnchor, setBlockRowCommentAnchor]);
    const selectionToolbarAnchorValue = selectionToolbarAnchor === undefined ? null : selectionToolbarAnchor;
    const isSelectionToolbarEnabled = selectionToolbarEnabled ?? selectionToolbarAnchor !== undefined;
    useEffect(() => {
      if (selectionToolbarAnchor !== undefined) {
        selectionAnchor$.set(selectionToolbarAnchorValue);
        onSelectionAnchorChange?.(selectionToolbarAnchorValue);
      }
    }, [onSelectionAnchorChange, selectionAnchor$, selectionToolbarAnchor, selectionToolbarAnchorValue]);
    useEffect(() => {
      return () => {
        selectionAnchor$.set(null);
        onSelectionAnchorChange?.(null);
      };
    }, [onSelectionAnchorChange, selectionAnchor$]);
    const listExtraData = useMemo(
      () => ({
        renderCommentBubble,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
      }),
      [renderCommentBubble, resolvedMarkdownLayout, resolvedMarkdownStyle],
    );
    const alwaysRenderActiveBlock = useMemo(
      () => (activeBlockId ? { keys: [activeBlockId] } : undefined),
      [activeBlockId],
    );
    const contentStyle = useMemo(
      () => [
        styles.contentContainer,
        {
          maxWidth: resolvedContentMaxWidth,
          paddingHorizontal: resolvedContentHorizontalPadding,
          paddingVertical: resolvedContentVerticalPadding,
        },
        contentContainerStyle,
      ],
      [contentContainerStyle, resolvedContentHorizontalPadding, resolvedContentMaxWidth, resolvedContentVerticalPadding],
    );
    const blockSelectionOverlayStyle = useMemo(
      () => [styles.blockSelectionOverlay, { backgroundColor: resolveSelectionColor(theme?.selectionColor) }],
      [theme?.selectionColor],
    );
    const renderMarkdownBlockRow = useCallback(
      (props: LegendListDataSourceRenderItemProps<string>) => props.item ? (
        <MarkdownBlockRow
          {...props}
          item={props.item}
          activeInputRef={activeInputRef}
          documentRenderState$={documentRenderState$}
          getBlockCount={getBlockCount}
          getBlockIdAtIndex={getBlockIdAtIndex}
          getBlockMetadata={getBlockAtIndexForRender}
          markdownLayout={resolvedMarkdownLayout}
          markdownStyle={resolvedMarkdownStyle}
          onActivate={activateBlock}
          onBlurRef={handleEditorBlurRef}
          onChangeMarkdownRef={handleChangeMarkdownRef}
          onChangeSelectionRef={handleChangeSelectionRef}
          onSelectionDragOutsideRef={handleSelectionDragOutsideRef}
          onVerticalNavigationOutsideRef={handleVerticalNavigationOutsideRef}
          renderCommentBubble={renderCommentBubble}
          selectionOverlayStyle={blockSelectionOverlayStyle}
        />
      ) : null,
      [
        activateBlock,
        documentRenderState$,
        getBlockCount,
        getBlockIdAtIndex,
        getBlockAtIndexForRender,
        handleEditorBlurRef,
        handleChangeMarkdownRef,
        handleChangeSelectionRef,
        handleSelectionDragOutsideRef,
        handleVerticalNavigationOutsideRef,
        renderCommentBubble,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
        blockSelectionOverlayStyle,
      ],
    );
    const selectionToolbarAnchorPublisherProps = useMemo<MarkdownBlockSelectionAnchorPublisherProps>(() => ({
      dataRevision: blockDataRevision,
      documentRenderState$,
      enabled: selectionToolbarAnchor === undefined && blockSelection !== null,
      getBlockIdAtIndex,
      getBlockIndexById,
      inactiveOverlayWidth$,
      listRef,
      onSelectionAnchorChangeRef,
      resolvedContentHorizontalPadding,
      resolvedContentVerticalPadding,
      selectionAnchor$,
    }), [
      blockDataRevision,
      blockSelection,
      documentRenderState$,
      getBlockIdAtIndex,
      getBlockIndexById,
      inactiveOverlayWidth$,
      listRef,
      onSelectionAnchorChangeRef,
      resolvedContentHorizontalPadding,
      resolvedContentVerticalPadding,
      selectionAnchor$,
      selectionToolbarAnchor,
    ]);
    const selectionToolbarFooter = useMemo(() => (
      <MarkdownSelectionToolbarFooter
        anchorPublisherProps={selectionToolbarAnchorPublisherProps}
        enabled={isSelectionToolbarEnabled}
        renderSelectionToolbar={renderSelectionToolbar}
        selectionAnchor$={selectionAnchor$}
      />
    ), [isSelectionToolbarEnabled, renderSelectionToolbar, selectionAnchor$, selectionToolbarAnchorPublisherProps]);
    const handleListLoad = useCallback(() => {
      const snapshot = loadedSnapshotRef.current;
      if (!adapter.getBlockIds && snapshot) {
        hydrateRemainingBlocks(snapshot, loadVersionRef.current);
      }
    }, [adapter, hydrateRemainingBlocks]);
    const activeBlockStateForRender = useValue(documentRenderState$.activeBlocksById.get(activeBlockId ?? ""));
    const activeBlockMarkdown = activeBlockStateForRender?.block.markdown ?? (activeBlockId ? draftMarkdown : "");
    const applyNativeEditorFrame = useCallback((frame: NativeEditorFramePayload, source: "begin" | "change") => {
      const { blockId, height, rowHeight, width, x, y } = frame;
      const blockIndex = getBlockIndexById(blockId);
      const blockMetadata = blockIndex >= 0 ? getBlockAtIndexForRender(blockId, blockIndex) : undefined;
      const block = blockMetadata && !isMarkdownBlockSnapshot(blockMetadata) && frame.markdown !== undefined
        ? {
          ...blockMetadata,
          markdown: frame.markdown,
        }
        : blockMetadata;
      if (!block) {
        return undefined;
      }

      if (source === "change" && activeBlockIdRef.current && activeBlockIdRef.current !== blockId) {
        return undefined;
      }

      nativeEditingBlockIdRef.current = blockId;
      const nextOverlayFrame = {
        height,
        left: x,
        rowHeight,
        top: y,
        width,
      };
      overlayFrameRef.current = nextOverlayFrame;
      overlayFrameBlockIdRef.current = blockId;
      if (pendingInitialEditorFrameRef.current?.blockId === blockId) {
        pendingInitialEditorFrameRef.current = undefined;
      }
      const activeRenderState$ = documentRenderState$.activeBlocksById.get(blockId);
      const activeRenderState = activeRenderState$.peek();
      if (activeRenderState) {
        activeRenderState$.set({
          ...activeRenderState,
          editorFrame: nextOverlayFrame,
        });
      }

      return block;
    }, [documentRenderState$, getBlockAtIndexForRender, getBlockIndexById]);
    const handleNativeBeginEditing = useCallback(
      (event: NativeEditorFrameEvent) => {
        const block = applyNativeEditorFrame(event.nativeEvent, "begin");
        if (block) {
          schedulePendingVerticalNavigationSelection();
          if (activeBlockIdRef.current !== block.id) {
            commitActiveBlock({ updateReactState: true }).catch(reportAsyncError);
            blockSelectionGestureRef.current = null;
            setNextBlockSelection(null);
            clearTextSelectionAnchor();
            activeBlockIdRef.current = block.id;
            nativeEditingBlockIdRef.current = block.id;
            setActiveActivationMode("nativePointer");
            setActiveSelection(0);
            setActiveBlockId(block.id);
            if (isMarkdownBlockSnapshot(block)) {
              setActiveBlock(block, 0, "nativePointer");
            } else if (documentState.status === "loaded") {
              const documentId = documentState.snapshot.documentId;
              adapter.getBlock(documentId, block.id)
                .then((nextBlock) => {
                  if (activeBlockIdRef.current === nextBlock.id) {
                    setActiveBlock(nextBlock, 0, "nativePointer");
                  }
                })
                .catch(reportAsyncError);
            }
          }
        }
      },
      [
        adapter,
        applyNativeEditorFrame,
        clearTextSelectionAnchor,
        commitActiveBlock,
        documentState,
        reportAsyncError,
        schedulePendingVerticalNavigationSelection,
        setActiveActivationMode,
        setActiveBlock,
        setNextBlockSelection,
      ],
    );
    const handleNativeEditorFrameChange = useCallback(
      (event: NativeEditorFrameEvent) => {
        const block = applyNativeEditorFrame(event.nativeEvent, "change");
        if (block) {
          schedulePendingVerticalNavigationSelection();
        }
      },
      [applyNativeEditorFrame, schedulePendingVerticalNavigationSelection],
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

    const documentContent = (
      <>
        <MarkdownBlockSelectionInput
          inputRef={blockSelectionInputRef}
          inputText$={blockSelectionInputText$}
          onChangeText={handleBlockSelectionInputChange}
          onKeyPress={handleBlockSelectionKeyPress}
        />
        <LegendList
          ref={listRef}
          alwaysRender={alwaysRenderActiveBlock}
          contentContainerStyle={contentStyle}
          dataSource={blockDataSource!}
          estimatedItemSize={estimatedItemSize}
          extraData={listExtraData}
          getItemType={getMarkdownBlockItemType}
          ListFooterComponent={selectionToolbarFooter}
          ListFooterComponentStyle={styles.selectionToolbarFooter}
          onLoad={handleListLoad}
          recycleItems
          renderItem={renderMarkdownBlockRow}
          style={styles.list}
        />
      </>
    );
    const containerStyle = [styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style];

    if (usesNativeEditorOverlay) {
      return (
        <MarkdownNativeEditorHost
          activeBlockId={activeBlockId ?? ""}
          activeBlockMarkdown={activeBlockMarkdown}
          containerRef={containerRef}
          markdownLayoutConfigJson={nativeMarkdownLayoutConfigJson}
          onBeginEditing={handleNativeBeginEditing}
          onBackspaceAtStart={handleNativeBackspaceAtStart}
          onEnterPressed={handleNativeEnterPressed}
          onEditorFrameChange={handleNativeEditorFrameChange}
          onLayout={measureContainerWindowLayout}
          style={containerStyle}
        >
          {documentContent}
        </MarkdownNativeEditorHost>
      );
    }

    return (
      <View
        ref={containerRef}
        onLayout={measureContainerWindowLayout}
        style={containerStyle}
      >
        {documentContent}
      </View>
    );
  },
);

MarkdownDocument.displayName = "MarkdownDocument";
