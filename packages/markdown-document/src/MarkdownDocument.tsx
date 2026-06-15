import { LegendList, type LegendListRef, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { MarkdownEditorHost } from "@legend-desktop/markdown-block-editor";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  type EnrichedMarkdownTextInputInstance,
} from "react-native-enriched-markdown";
import {
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
import { findBlockIdAtWindowY, getBlockSelectionRects, getSelectedBlockMarkdown } from "./blockSelection";
import {
  createMarkdownDocumentBlockState,
  mergeHydratedMarkdownBlocksForRevision,
  validateMarkdownTransactionResultToBlockState,
} from "./documentStateModel";
import { MarkdownBlockRow, MarkdownOverlayEditorInput } from "./MarkdownBlockRow";
import { markdownDocumentStyles as styles } from "./MarkdownDocument.styles";
import { contentHorizontalPadding, contentMaxWidth, editDebounceMs, estimatedItemSize, hydrateChunkSize, usesNativeEditorOverlay } from "./constants";
import type {
  BlockLayout,
  BlockSelectionState,
  DocumentState,
  HistoryEntry,
  OverlayFrame,
  SelectionDragOutsideEvent,
  UpdateBlockHistoryEntry,
} from "./internalTypes";
import {
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
import { defaultMarkdownLayout, defaultMarkdownStyle } from "./styles";
import type {
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

function logMarkdownDocumentDiagnostics(event: string, data: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[MarkdownDocument] ${event}`, data);
  }
}

function countMarkdownLineBreaks(markdown: string) {
  return markdown.match(markdownLineBreakPattern)?.length ?? 0;
}

function isTwoLineMarkdownPasteFromEmptyBlock(markdown: string) {
  const lines = markdown.split(markdownLineBreakPattern);
  return lines.length === 2 && (
    (markdownFenceStartPattern.test(lines[0] ?? "") && (lines[1] ?? "").length > 0) ||
    (markdownListLinePattern.test(lines[0] ?? "") && markdownListLinePattern.test(lines[1] ?? ""))
  );
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
      selectionToolbarAnchor,
      style,
      theme,
    },
    ref,
  ) => {
    const loadVersionRef = useRef(0);
    const hydrateFrameRef = useRef<number | undefined>(undefined);
    const containerRef = useRef<View>(null);
    const listRef = useRef<LegendListRef | null>(null);
    const activeInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
    const editTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const saveRef = useRef<(() => Promise<void>) | undefined>(undefined);
    const saveInFlightRef = useRef<Promise<void> | undefined>(undefined);
    const activeBlockIdRef = useRef<string | null>(null);
    const blockSelectionInputRef = useRef<TextInput | null>(null);
    const blockSelectionGestureRef = useRef<BlockSelectionState | null>(null);
    const activeInputSelectionRef = useRef({ start: 0, end: 0 });
    const nativeEditingBlockIdRef = useRef<string | null>(null);
    const blockContentLayoutsRef = useRef(new Map<string, BlockLayout>());
    const overlayFrameRef = useRef<OverlayFrame | undefined>(undefined);
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
    const scrollOffsetYRef = useRef(0);
    const scrollViewportHeightRef = useRef(0);
    const [blockState, setBlockState] = useState(() => createMarkdownDocumentBlockState([]));
    const { blockIds, blocksById } = blockState;
    const blockStateRef = useRef(blockState);
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [activeSelection, setActiveSelection] = useState(0);
    const [blockSelection, setBlockSelection] = useState<BlockSelectionState | null>(null);
    const blockSelectionRef = useRef<BlockSelectionState | null>(null);
    const [blockSelectionInputText, setBlockSelectionInputText] = useState("");
    const [containerWindowY, setContainerWindowY] = useState(0);
    const [draftMarkdown, setDraftMarkdown] = useState("");
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [overlayFrame, setOverlayFrame] = useState<OverlayFrame | undefined>(undefined);
    const [contentContainerOffsetX, setContentContainerOffsetX] = useState(0);
    const [textSelectionAnchor, setTextSelectionAnchor] = useState<MarkdownSelectionAnchor | null>(null);
    const [inactiveOverlayWidth, setInactiveOverlayWidth] = useState(contentMaxWidth - contentHorizontalPadding * 2);
    const [documentState, setDocumentState] = useState<DocumentState>({ status: "loading" });
    const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
    const onDirtyChangeRef = useLatestRef(onDirtyChange);
    const onCommandStateChangeRef = useLatestRef(onCommandStateChange);
    const onErrorRef = useLatestRef(onError);
    const onLoadErrorRef = useLatestRef(onLoadError);
    const onLoadedRef = useLatestRef(onLoaded);
    const onSaveStateChangeRef = useLatestRef(onSaveStateChange);
    const resolvedMarkdownLayout = markdownLayout ?? defaultMarkdownLayout;
    const resolvedMarkdownStyle = markdownStyle ?? defaultMarkdownStyle;
    const resolvedContentMaxWidth = resolvedMarkdownLayout.content?.maxWidth ?? contentMaxWidth;
    const resolvedContentHorizontalPadding = resolvedMarkdownLayout.content?.horizontalPadding ?? contentHorizontalPadding;
    const resolvedContentVerticalPadding = resolvedMarkdownLayout.content?.verticalPadding ?? 48;

    const reportAsyncError = useCallback(
      (error: unknown) => {
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      },
      [onErrorRef],
    );

    useEffect(() => {
      blockStateRef.current = blockState;
    }, [blockState]);

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
        setSaveState(nextSaveState);
        onSaveStateChangeRef.current?.(nextSaveState);
      },
      [onSaveStateChangeRef],
    );

    const setNextBlockSelection = useCallback((nextBlockSelection: BlockSelectionState | null) => {
      blockSelectionRef.current = nextBlockSelection;
      setBlockSelection(nextBlockSelection);
    }, []);

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

    const clearTextSelectionAnchor = useCallback(() => {
      selectionAnchorRequestRef.current += 1;
      activeInputSelectionRef.current = { start: 0, end: 0 };
      setTextSelectionAnchor(null);
    }, []);

    const updateTextSelectionAnchor = useCallback((selection: { start: number; end: number }) => {
      activeInputSelectionRef.current = selection;
      const requestId = selectionAnchorRequestRef.current + 1;
      selectionAnchorRequestRef.current = requestId;
      const selectedLength = Math.abs(selection.end - selection.start);
      const selectionStart = Math.min(selection.start, selection.end);
      const selectionEnd = Math.max(selection.start, selection.end);

      if (selection.start === selection.end) {
        setTextSelectionAnchor(null);
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
              const activeBlockLayout = activeBlockId ? blockContentLayoutsRef.current.get(activeBlockId) : undefined;
              const nativeOverlayFrame = usesNativeEditorOverlay ? overlayFrameRef.current : undefined;
              const itemX = activeBlockLayout
                ? contentContainerOffsetX + resolvedContentHorizontalPadding
                : nativeOverlayFrame?.left ?? measuredItemX;
              const itemY = activeBlockLayout
                ? activeBlockLayout.y
                : nativeOverlayFrame?.top ?? measuredItemY;
              const itemWidth = activeBlockLayout
                ? inactiveOverlayWidth
                : nativeOverlayFrame?.width ?? inputWidth;
              const itemHeight = activeBlockLayout?.height ?? nativeOverlayFrame?.height ?? inputHeight;
              const contentItemX = itemX - contentContainerOffsetX;
              const activeMarkdown = draftMarkdownRef.current;
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
                markdown: activeMarkdown,
                paragraphFontSize,
                paragraphLineHeight,
                scrollOffsetY: nativeOverlayFrame ? 0 : scrollOffsetYRef.current,
                selectedLength,
                selectionEnd,
                selectionStart,
              });
              setTextSelectionAnchor(anchor);
            });
          });
        }).catch(reportAsyncError);
      });
    }, [contentContainerOffsetX, reportAsyncError, resolvedMarkdownStyle]);
    const handleChangeSelectionRef = useLatestRef(updateTextSelectionAnchor);

    const cancelHydration = useCallback(() => {
      if (hydrateFrameRef.current !== undefined) {
        cancelAnimationFrame(hydrateFrameRef.current);
        hydrateFrameRef.current = undefined;
      }
    }, []);

    const mergeBlocks = useCallback((blocks: MarkdownBlockSnapshot[], requestRevision: number) => {
      if (blocks.length === 0) {
        return;
      }

      setBlockState((previousBlockState) => mergeHydratedMarkdownBlocksForRevision({
        blocks,
        currentRevision: currentRevisionRef.current,
        previousState: previousBlockState,
        requestRevision,
      }));
    }, []);

    const validateTransactionResult = useCallback((result: MarkdownTransactionResult) => {
      return validateMarkdownTransactionResultToBlockState(blockStateRef.current, result);
    }, []);

    const applyTransactionResult = useCallback((result: MarkdownTransactionResult) => {
      const nextBlockState = validateTransactionResult(result);
      blockStateRef.current = nextBlockState;
      currentRevisionRef.current = result.revision;
      setBlockState(nextBlockState);

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
    }, [validateTransactionResult]);

    const updateRenderedBlockMarkdown = useCallback((blockId: string, markdown: string) => {
      setBlockState((previousBlockState) => {
        const block = previousBlockState.blocksById.get(blockId);
        if (!block || block.markdown === markdown) {
          return previousBlockState;
        }

        const blocksById = new Map(previousBlockState.blocksById);
        blocksById.set(blockId, {
          ...block,
          contentEndByte: block.contentStartByte !== undefined ? block.contentStartByte + markdown.length : block.contentEndByte,
          markdown,
          sourceEndByte: block.sourceStartByte + markdown.length,
          textRevision: block.textRevision + 1,
        });
        return {
          ...previousBlockState,
          blocksById,
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
        if (result.changedRange.blockIds.length === 1 && firstChangedBlockId === activeBlockIdValue) {
          pushUpdateBlockHistoryEntry(
            {
              type: "updateBlockMarkdown",
              blockId: activeBlockIdValue,
              beforeMarkdown,
              afterMarkdown: markdown,
            },
            { groupTyping: true },
          );
        } else if (firstChangedBlockId && lastChangedBlockId) {
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
        if (activeBlockIdRef.current === activeBlockIdValue) {
          const nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue) ?? result.changedBlocks[0];
          if (nextActiveBlock) {
            activeBlockIdRef.current = nextActiveBlock.id;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveSelection(Math.min(activeInputSelectionRef.current.start, nextActiveBlock.markdown.length));
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
          activeInputRef.current?.setValue(committedMarkdownRef.current);
          setActiveSelection(Math.min(activeInputSelectionRef.current.start, committedMarkdownRef.current.length));
        }
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      }
    }, [
      adapter,
      applyTransactionResult,
      clearEditTimer,
      clearTypingHistoryGroup,
      documentState,
      onErrorRef,
      publishCommandState,
      pushUpdateBlockHistoryEntry,
      updateRenderedBlockMarkdown,
      validateTransactionResult,
    ]);

    const setActiveBlock = useCallback((block: MarkdownBlockSnapshot, selection: number) => {
      nativeEditingBlockIdRef.current = block.id;
      activeBlockIdRef.current = block.id;
      draftMarkdownRef.current = block.markdown;
      committedMarkdownRef.current = block.markdown;
      setDraftMarkdown(block.markdown);
      setActiveSelection(selection);
      setActiveBlockId(block.id);
    }, []);

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

    const beginBlockSelection = useCallback(
      (anchorBlockId: string, focusBlockId: string) => {
        const activeBlockIdValue = activeBlockIdRef.current;
        commitActiveBlock({ updateReactState: true }).catch(reportAsyncError);
        clearTextSelectionAnchor();
        if (activeBlockIdValue && activeBlockIdValue !== anchorBlockId) {
          activeInputRef.current?.blur();
          nativeEditingBlockIdRef.current = null;
          overlayFrameRef.current = undefined;
          activeBlockIdRef.current = null;
          setActiveBlockId(null);
          setActiveSelection(0);
        }
        const nextBlockSelection = { anchorBlockId, focusBlockId };
        blockSelectionGestureRef.current = nextBlockSelection;
        setNextBlockSelection(nextBlockSelection);
      },
      [clearTextSelectionAnchor, commitActiveBlock, reportAsyncError, setNextBlockSelection],
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
      return findBlockIdAtWindowY({
        blockIds,
        containerWindowY,
        direction,
        layoutsByBlockId: blockContentLayoutsRef.current,
        scrollOffsetY: scrollOffsetYRef.current,
        windowY: y,
      });
    }, [blockIds, containerWindowY]);

    const handleBlockWindowLayout = useCallback((blockId: string, windowLayout: BlockLayout) => {
      const layout = {
        height: windowLayout.height,
        y: windowLayout.y - containerWindowY + scrollOffsetYRef.current,
      };
      const previousLayout = blockContentLayoutsRef.current.get(blockId);
      if (previousLayout?.y === layout.y && previousLayout.height === layout.height) {
        return;
      }
      blockContentLayoutsRef.current.set(blockId, layout);
      setLayoutVersion((version) => version + 1);
    }, [containerWindowY]);

    const scrollBlockIntoView = useCallback((blockId: string) => {
      const blockLayout = blockContentLayoutsRef.current.get(blockId);
      const viewportHeight = scrollViewportHeightRef.current;
      const currentScrollOffset = scrollOffsetYRef.current;

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
          scrollOffsetYRef.current = nextScrollOffset;
          listRef.current?.scrollToOffset({ animated: true, offset: nextScrollOffset }).catch(reportAsyncError);
        }
      }
    }, [reportAsyncError]);

    const measureContainerWindowLayout = useCallback((event?: LayoutChangeEvent) => {
      if (event) {
        const containerWidth = event.nativeEvent.layout.width;
        scrollViewportHeightRef.current = event.nativeEvent.layout.height;
        const constrainedContentWidth = Math.min(containerWidth, resolvedContentMaxWidth);
        const nextContentWidth = Math.max(1, constrainedContentWidth - resolvedContentHorizontalPadding * 2);
        setContentContainerOffsetX(Math.max(0, (containerWidth - constrainedContentWidth) / 2));
        setInactiveOverlayWidth(nextContentWidth);
      }
      requestAnimationFrame(() => {
        containerRef.current?.measureInWindow((_x, y) => {
          setContainerWindowY(y);
        });
      });
    }, [resolvedContentHorizontalPadding, resolvedContentMaxWidth]);

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

        const blockIndex = blockIds.indexOf(blockId);
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

        const nextBlockId = event.direction === "up" ? blockIds[blockIndex - 1] : blockIds[blockIndex + 1];
        if (!nextBlockId) {
          return;
        }

        if (blockSelectionGestureRef.current) {
          updateBlockSelectionGesture(blockId, nextBlockId);
        } else {
          beginBlockSelection(blockId, nextBlockId);
        }
      },
      [beginBlockSelection, blockIdAtWindowY, blockIds, setNextBlockSelection, updateBlockSelectionGesture],
    );
    const handleSelectionDragOutsideRef = useLatestRef(handleSelectionDragOutside);

    const splitActiveBlock = useCallback(
      async (block: MarkdownBlockSnapshot, beforeMarkdown: string, afterMarkdown: string) => {
        clearEditTimer();

        if (documentState.status !== "loaded" || !adapter.applyTransaction) {
          return;
        }

        try {
          clearTypingHistoryGroup();
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "splitBlock",
            blockId: block.id,
            beforeMarkdown,
            afterMarkdown,
          });
          validateTransactionResult(result);
          applyTransactionResult(result);

          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          if (!suppressHistoryRef.current && firstChangedBlockId && lastChangedBlockId) {
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

          const nextActiveBlockId = result.changedRange.blockIds[1] ?? result.changedRange.blockIds[0] ?? block.id;
          activeBlockIdRef.current = nextActiveBlockId;
          nativeEditingBlockIdRef.current = nextActiveBlockId;
          draftMarkdownRef.current = afterMarkdown;
          committedMarkdownRef.current = afterMarkdown;
          setDraftMarkdown(afterMarkdown);
          setActiveSelection(afterMarkdown.length);
          setActiveBlockId(nextActiveBlockId);
          markDirty();
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        clearEditTimer,
        clearTypingHistoryGroup,
        documentState,
        markDirty,
        onErrorRef,
        publishCommandState,
        validateTransactionResult,
      ],
    );

    const handleChangeMarkdown = useCallback(
      (block: MarkdownBlockSnapshot, markdown: string) => {
        if (activeBlockIdRef.current !== block.id) {
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

        if (block.type !== "codeBlock") {
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
        setDraftMarkdown(markdown);
        if (usesNativeEditorOverlay) {
          updateRenderedBlockMarkdown(block.id, markdown);
        }
        markDirty();
        clearEditTimer();
        editTimerRef.current = setTimeout(() => {
          commitActiveBlock({ updateReactState: false }).catch(reportAsyncError);
        }, editDebounceMs);
      },
      [clearEditTimer, commitActiveBlock, markDirty, reportAsyncError, splitActiveBlock, updateRenderedBlockMarkdown],
    );
    const handleChangeMarkdownRef = useLatestRef(handleChangeMarkdown);

    const handleEditorBlur = useCallback(() => {
      const blurredBlockId = activeBlockIdRef.current;
      commitActiveBlock({ updateReactState: true }).then(() => {
        if (activeBlockIdRef.current !== blurredBlockId) {
          return;
        }
        nativeEditingBlockIdRef.current = null;
        overlayFrameRef.current = undefined;
        activeBlockIdRef.current = null;
        setActiveBlockId(null);
        setActiveSelection(0);
        clearTextSelectionAnchor();
        clearTypingHistoryGroup();
      }).catch(reportAsyncError);
    }, [clearTextSelectionAnchor, clearTypingHistoryGroup, commitActiveBlock, reportAsyncError]);
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
        overlayFrameRef.current = undefined;
        activeBlockIdRef.current = null;
        setActiveBlockId(null);
        setActiveSelection(0);
        clearTextSelectionAnchor();
        clearTypingHistoryGroup();
      }).catch(reportAsyncError);

      return true;
    }, [clearTextSelectionAnchor, clearTypingHistoryGroup, commitActiveBlock, reportAsyncError]);

    const replaceBlockSelection = useCallback(
      async (markdown: string) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction || !blockSelection) {
          return;
        }

        const selectedBlocks = getSelectedBlockMarkdown({ blockIds, blocksById, blockSelection });
        if (!selectedBlocks) {
          return;
        }

        clearEditTimer();
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
            const nextHistoryEntry = firstChangedBlockId && lastChangedBlockId
              ? {
                  type: "replaceBlockRange" as const,
                  startBlockId: firstChangedBlockId,
                  endBlockId: lastChangedBlockId,
                  replacementMarkdown: selectedBlocks.markdown,
                  inverseMarkdown: markdown,
                }
              : (() => {
                  const nextBlockId = blockIds[selectedBlocks.endIndex + 1];
                  const previousBlockId = blockIds[selectedBlocks.startIndex - 1];
                  const nextBlock = nextBlockId ? blocksById.get(nextBlockId) : undefined;
                  const previousBlock = previousBlockId ? blocksById.get(previousBlockId) : undefined;
                  if (nextBlock) {
                    return {
                      type: "replaceBlockRange" as const,
                      startBlockId: nextBlock.id,
                      endBlockId: nextBlock.id,
                      replacementMarkdown: `${selectedBlocks.markdown}\n\n${nextBlock.markdown}`,
                      inverseMarkdown: nextBlock.markdown,
                    };
                  }
                  if (previousBlock) {
                    return {
                      type: "replaceBlockRange" as const,
                      startBlockId: previousBlock.id,
                      endBlockId: previousBlock.id,
                      replacementMarkdown: `${previousBlock.markdown}\n\n${selectedBlocks.markdown}`,
                      inverseMarkdown: previousBlock.markdown,
                    };
                  }
                  return undefined;
                })();

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
            activeBlockIdRef.current = nextActiveBlock.id;
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
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
        blockIds,
        blockSelection,
        blocksById,
        clearEditTimer,
        clearTypingHistoryGroup,
        documentState,
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

        clearEditTimer();
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
          const nextActiveBlock = result.changedBlocks[0] ?? blocksById.get(activeBlockIdValue);
          if (nextActiveBlock) {
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            activeBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
            setActiveBlockId(nextActiveBlock.id);
            setActiveSelection(0);
            activeInputRef.current?.setValue(nextActiveBlock.markdown);
            activeInputRef.current?.setSelection(0, 0);
          }
          markDirty();
        } catch (error) {
          updateRenderedBlockMarkdown(activeBlockIdValue, committedMarkdownRef.current);
          draftMarkdownRef.current = committedMarkdownRef.current;
          setDraftMarkdown(committedMarkdownRef.current);
          activeInputRef.current?.setValue(committedMarkdownRef.current);
          setActiveSelection(Math.min(activeInputSelectionRef.current.start, committedMarkdownRef.current.length));
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
        }
      },
      [
        adapter,
        applyTransactionResult,
        blocksById,
        clearEditTimer,
        documentState,
        markDirty,
        onErrorRef,
        pushUpdateBlockHistoryEntry,
        updateRenderedBlockMarkdown,
        validateTransactionResult,
      ],
    );

    const formatCurrentBlockRange = useCallback(
      (transform: (markdown: string) => string) => {
        async function runFormat() {
          if (blockSelection) {
            const selectedBlocks = getSelectedBlockMarkdown({ blockIds, blocksById, blockSelection });
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
        blockIds,
        blockSelection,
        blocksById,
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

        const currentBlockIds = blockStateRef.current.blockIds;
        const firstIndex = currentBlockIds.indexOf(startBlockId);
        const secondIndex = currentBlockIds.indexOf(endBlockId);
        const targetIndex = currentBlockIds.indexOf(targetBlockId);
        if (firstIndex < 0 || secondIndex < 0 || targetIndex < 0) {
          return;
        }

        const rangeStartIndex = Math.min(firstIndex, secondIndex);
        const rangeEndIndex = Math.max(firstIndex, secondIndex);
        if (targetIndex >= rangeStartIndex && targetIndex <= rangeEndIndex) {
          return;
        }

        const previousBlockId = currentBlockIds[rangeStartIndex - 1];
        const nextBlockId = currentBlockIds[rangeEndIndex + 1];
        const inverseTargetBlockId = previousBlockId ?? nextBlockId;
        const inversePlacement = previousBlockId ? "after" : "before";
        if (!inverseTargetBlockId) {
          return;
        }

        clearEditTimer();
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
          const nextActiveBlock = activeBlockIdValue
            ? result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue)
            : undefined;
          if (nextActiveBlock) {
            nativeEditingBlockIdRef.current = nextActiveBlock.id;
            draftMarkdownRef.current = nextActiveBlock.markdown;
            committedMarkdownRef.current = nextActiveBlock.markdown;
            setDraftMarkdown(nextActiveBlock.markdown);
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
        clearEditTimer,
        clearTypingHistoryGroup,
        documentState,
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
          const currentBlockIds = blockStateRef.current.blockIds;
          const currentBlockSelection = blockSelectionRef.current;
          if (currentBlockSelection) {
            const anchorIndex = currentBlockIds.indexOf(currentBlockSelection.anchorBlockId);
            const focusIndex = currentBlockIds.indexOf(currentBlockSelection.focusBlockId);
            if (anchorIndex >= 0 && focusIndex >= 0) {
              const rangeStartIndex = Math.min(anchorIndex, focusIndex);
              const rangeEndIndex = Math.max(anchorIndex, focusIndex);
              const targetBlockId = direction === "up"
                ? currentBlockIds[rangeStartIndex - 1]
                : currentBlockIds[rangeEndIndex + 1];
              if (targetBlockId) {
                await applyMoveBlockRange({
                  endBlockId: currentBlockIds[rangeEndIndex]!,
                  placement: direction === "up" ? "before" : "after",
                  startBlockId: currentBlockIds[rangeStartIndex]!,
                  targetBlockId,
                });
              }
            }
          } else {
            const activeBlockIdValue = activeBlockIdRef.current;
            if (!activeBlockIdValue) {
              return;
            }

            const activeBlockIndex = currentBlockIds.indexOf(activeBlockIdValue);
            const targetBlockId = direction === "up"
              ? currentBlockIds[activeBlockIndex - 1]
              : currentBlockIds[activeBlockIndex + 1];
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
      [applyMoveBlockRange, commitActiveBlock, reportAsyncError],
    );

    const focusAdjacentBlock = useCallback(
      (direction: "up" | "down") => {
        async function runFocus() {
          await commitActiveBlock({ updateReactState: true });
          const activeBlockIdValue = activeBlockIdRef.current;
          if (activeBlockIdValue) {
            const currentBlockState = blockStateRef.current;
            const activeBlockIndex = currentBlockState.blockIds.indexOf(activeBlockIdValue);
            const targetBlockId = direction === "up"
              ? currentBlockState.blockIds[activeBlockIndex - 1]
              : currentBlockState.blockIds[activeBlockIndex + 1];
            const targetBlock = targetBlockId ? currentBlockState.blocksById.get(targetBlockId) : undefined;
            if (targetBlock) {
              blockSelectionGestureRef.current = null;
              setNextBlockSelection(null);
              clearTextSelectionAnchor();
              setActiveBlock(
                targetBlock,
                Math.min(activeInputSelectionRef.current.start, targetBlock.markdown.length),
              );
              scrollBlockIntoView(targetBlock.id);
            }
          }
        }

        runFocus().catch(reportAsyncError);
      },
      [clearTextSelectionAnchor, commitActiveBlock, reportAsyncError, scrollBlockIntoView, setActiveBlock, setNextBlockSelection],
    );

    const focusBoundaryBlock = useCallback(
      (direction: "up" | "down") => {
        async function runFocus() {
          await commitActiveBlock({ updateReactState: true });
          const currentBlockState = blockStateRef.current;
          const targetBlockId = direction === "up"
            ? currentBlockState.blockIds[0]
            : currentBlockState.blockIds[currentBlockState.blockIds.length - 1];
          const targetBlock = targetBlockId ? currentBlockState.blocksById.get(targetBlockId) : undefined;
          if (targetBlock) {
            blockSelectionGestureRef.current = null;
            setNextBlockSelection(null);
            clearTextSelectionAnchor();
            setActiveBlock(
              targetBlock,
              Math.min(activeInputSelectionRef.current.start, targetBlock.markdown.length),
            );
            scrollBlockIntoView(targetBlock.id);
          }
        }

        runFocus().catch(reportAsyncError);
      },
      [clearTextSelectionAnchor, commitActiveBlock, reportAsyncError, scrollBlockIntoView, setActiveBlock, setNextBlockSelection],
    );

    const setKeyboardBlockSelection = useCallback((anchorBlockId: string, focusBlockId: string) => {
      activeInputRef.current?.blur?.();
      nativeEditingBlockIdRef.current = null;
      overlayFrameRef.current = undefined;
      activeBlockIdRef.current = null;
      blockSelectionGestureRef.current = null;
      clearTextSelectionAnchor();
      setActiveBlockId(null);
      setActiveSelection(0);
      setNextBlockSelection({ anchorBlockId, focusBlockId });
    }, [clearTextSelectionAnchor, setNextBlockSelection]);

    const extendBlockSelection = useCallback(
      (direction: "up" | "down") => {
        const currentBlockState = blockStateRef.current;
        const currentBlockSelection = blockSelectionRef.current;
        if (currentBlockSelection) {
          const focusIndex = currentBlockState.blockIds.indexOf(currentBlockSelection.focusBlockId);
          const nextFocusBlockId = direction === "up"
            ? currentBlockState.blockIds[focusIndex - 1]
            : currentBlockState.blockIds[focusIndex + 1];
          if (focusIndex >= 0 && nextFocusBlockId) {
            setNextBlockSelection({
              anchorBlockId: currentBlockSelection.anchorBlockId,
              focusBlockId: nextFocusBlockId,
            });
          }
          return true;
        }

        const activeBlockIdValue = activeBlockIdRef.current;
        const activeBlockIndex = activeBlockIdValue ? currentBlockState.blockIds.indexOf(activeBlockIdValue) : -1;
        const selection = activeInputSelectionRef.current;
        const selectionStart = Math.min(selection.start, selection.end);
        const selectionEnd = Math.max(selection.start, selection.end);
        const isAtSelectionBoundary = direction === "up"
          ? selectionStart === 0
          : selectionEnd === draftMarkdownRef.current.length;
        const targetBlockId = direction === "up"
          ? currentBlockState.blockIds[activeBlockIndex - 1]
          : currentBlockState.blockIds[activeBlockIndex + 1];
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
            const nextBlockState = blockStateRef.current;
            const nextActiveBlockIndex = nextActiveBlockId ? nextBlockState.blockIds.indexOf(nextActiveBlockId) : -1;
            const nextFocusBlockId = direction === "up"
              ? nextBlockState.blockIds[nextActiveBlockIndex - 1]
              : nextBlockState.blockIds[nextActiveBlockIndex + 1];
            if (nextActiveBlockId && nextActiveBlockIndex >= 0 && nextFocusBlockId) {
              setKeyboardBlockSelection(nextActiveBlockId, nextFocusBlockId);
            }
          }

          runExtendSelection().catch(reportAsyncError);
          return true;
        }

        return false;
      },
      [commitActiveBlock, reportAsyncError, setKeyboardBlockSelection, setNextBlockSelection],
    );

    const runActiveInputCommand = useCallback((command: () => void) => {
      const input = activeInputRef.current;
      if (!input) {
        return;
      }

      const selection = activeInputSelectionRef.current;
      input.focus();
      input.setSelection(selection.start, selection.end);
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
        setBlockSelectionInputText("");
        if (blockSelection && text.length > 0) {
          replaceBlockSelection(text).catch(reportAsyncError);
        }
      },
      [blockSelection, replaceBlockSelection, reportAsyncError],
    );

    const hydrateRemainingBlocks = useCallback(
      (snapshot: MarkdownDocumentSnapshot, loadVersion: number) => {
        cancelHydration();

        let startIndex = snapshot.initialBlocks.length;
        let hydratedBlockCount = 0;
        let hydrationChunkCount = 0;
        const requestRevision = currentRevisionRef.current;
        const hydrationStartedAt = Date.now();
        const hydrateNextChunk = () => {
          hydrateFrameRef.current = undefined;
          if (loadVersion !== loadVersionRef.current || requestRevision !== currentRevisionRef.current || startIndex >= snapshot.blockCount) {
            return;
          }

          const count = Math.min(hydrateChunkSize, snapshot.blockCount - startIndex);
          adapter
            .getBlocks(snapshot.documentId, startIndex, count)
            .then((blocks) => {
              if (loadVersion !== loadVersionRef.current || requestRevision !== currentRevisionRef.current) {
                return;
              }

              mergeBlocks(blocks, requestRevision);
              startIndex += blocks.length;
              hydratedBlockCount += blocks.length;
              hydrationChunkCount += 1;

              if (blocks.length > 0 && startIndex < snapshot.blockCount) {
                hydrateFrameRef.current = requestAnimationFrame(hydrateNextChunk);
              } else {
                logMarkdownDocumentDiagnostics("hydrated", {
                  blockCount: snapshot.blockCount,
                  chunks: hydrationChunkCount,
                  durationMs: Date.now() - hydrationStartedAt,
                  hydratedBlockCount,
                  initialBlockCount: snapshot.initialBlocks.length,
                });
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
      blockContentLayoutsRef.current.clear();
      draftMarkdownRef.current = "";
      committedMarkdownRef.current = "";
      currentRevisionRef.current = 0;
      savedRevisionRef.current = 0;
      isDirtyRef.current = false;
      pendingRenderTransactionRef.current = undefined;
      autosavePausedRef.current = false;
      undoStackRef.current = [];
      redoStackRef.current = [];
      publishCommandState();
      suppressHistoryRef.current = false;
      clearTypingHistoryGroup();
      blockSelectionGestureRef.current = null;
      activeInputSelectionRef.current = { start: 0, end: 0 };
      selectionAnchorRequestRef.current += 1;
      nativeEditingBlockIdRef.current = null;
      overlayFrameRef.current = undefined;
      setDocumentState({ status: "loading" });
      setBlockState(createMarkdownDocumentBlockState([]));
      setActiveBlockId(null);
      setActiveSelection(0);
      setNextBlockSelection(null);
      setBlockSelectionInputText("");
      setDraftMarkdown("");
      setOverlayFrame(undefined);
      setTextSelectionAnchor(null);
      setNextSaveState("idle");
      onDirtyChangeRef.current?.(false);

      adapter
        .load(filename)
        .then((snapshot) => {
          if (isCanceled || loadVersion !== loadVersionRef.current) {
            adapter.close(snapshot.documentId).catch(reportAsyncError);
            return;
          }

          setBlockState(createMarkdownDocumentBlockState(snapshot.initialBlocks));
          setDocumentState({ status: "loaded", snapshot });
          logMarkdownDocumentDiagnostics("loaded", {
            blockCount: snapshot.blockCount,
            documentMs: snapshot.timing.documentMs,
            initialBlockCount: snapshot.initialBlocks.length,
            parseMs: snapshot.timing.parseMs,
            readMs: snapshot.timing.readMs,
            sourceSize: snapshot.sourceSize,
          });
          if (autoFocusFirstBlock) {
            const firstBlock = snapshot.initialBlocks[0];
            if (firstBlock) {
              activeBlockIdRef.current = firstBlock.id;
              nativeEditingBlockIdRef.current = firstBlock.id;
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
          onLoadErrorRef.current?.(nextError);
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
      onLoadErrorRef,
      onLoadedRef,
      publishCommandState,
      reportAsyncError,
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
        } catch (error: unknown) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          autosavePausedRef.current = true;
          setNextSaveState("error");
          onErrorRef.current?.(nextError);
          throw nextError;
        } finally {
          if (saveInFlightRef.current === savePromise) {
            saveInFlightRef.current = undefined;
          }
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
              activeInputRef.current?.setValue(entry.beforeMarkdown);
            }
            markDirty();
            return {
              type: "updateBlockMarkdown",
              blockId: entry.blockId,
              beforeMarkdown: entry.afterMarkdown,
              afterMarkdown: entry.beforeMarkdown,
            } satisfies HistoryEntry;
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
            const nextActiveBlockId = result.changedRange.blockIds[1] ?? result.changedRange.blockIds[0];
            const nextActiveBlock = result.changedBlocks.find((candidate) => candidate.id === nextActiveBlockId);
            if (nextActiveBlock) {
              activeBlockIdRef.current = nextActiveBlock.id;
              nativeEditingBlockIdRef.current = nextActiveBlock.id;
              draftMarkdownRef.current = nextActiveBlock.markdown;
              committedMarkdownRef.current = nextActiveBlock.markdown;
              setDraftMarkdown(nextActiveBlock.markdown);
              setActiveSelection(nextActiveBlock.markdown.length);
              setActiveBlockId(nextActiveBlock.id);
            }
            markDirty();
            if (!firstChangedBlockId || !lastChangedBlockId) {
              return null;
            }
            return {
              type: "replaceBlockRange",
              startBlockId: firstChangedBlockId,
              endBlockId: lastChangedBlockId,
              replacementMarkdown: entry.replacementMarkdown,
              inverseMarkdown: `${entry.beforeMarkdown}\n\n${entry.afterMarkdown}`,
              inverseSplit: {
                afterMarkdown: entry.afterMarkdown,
                beforeMarkdown: entry.beforeMarkdown,
              },
            } satisfies HistoryEntry;
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
            const nextActiveBlock = activeBlockIdValue
              ? result.changedBlocks.find((candidate) => candidate.id === activeBlockIdValue)
              : undefined;
            if (nextActiveBlock) {
              nativeEditingBlockIdRef.current = nextActiveBlock.id;
              draftMarkdownRef.current = nextActiveBlock.markdown;
              committedMarkdownRef.current = nextActiveBlock.markdown;
              setDraftMarkdown(nextActiveBlock.markdown);
              setActiveSelection(Math.min(activeInputSelectionRef.current.start, nextActiveBlock.markdown.length));
              setActiveBlockId(nextActiveBlock.id);
            }
            markDirty();
            return {
              type: "moveBlockRange",
              startBlockId: entry.startBlockId,
              endBlockId: entry.endBlockId,
              targetBlockId: entry.inverseTargetBlockId,
              placement: entry.inversePlacement,
              inverseTargetBlockId: entry.targetBlockId,
              inversePlacement: entry.placement,
            } satisfies HistoryEntry;
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
            activeBlockIdRef.current = firstChangedBlock.id;
            nativeEditingBlockIdRef.current = firstChangedBlock.id;
            draftMarkdownRef.current = firstChangedBlock.markdown;
            committedMarkdownRef.current = firstChangedBlock.markdown;
            setDraftMarkdown(firstChangedBlock.markdown);
            setActiveSelection(0);
            setActiveBlockId(firstChangedBlock.id);
          }
          markDirty();
          if (!firstChangedBlockId || !lastChangedBlockId) {
            return null;
          }
          if (entry.inverseSplit) {
            return {
              type: "splitBlock",
              blockId: firstChangedBlockId,
              beforeMarkdown: entry.inverseSplit.beforeMarkdown,
              afterMarkdown: entry.inverseSplit.afterMarkdown,
              replacementMarkdown: entry.replacementMarkdown,
            } satisfies HistoryEntry;
          }
          return {
            type: "replaceBlockRange",
            startBlockId: firstChangedBlockId,
            endBlockId: lastChangedBlockId,
            replacementMarkdown: entry.inverseMarkdown,
            inverseMarkdown: entry.replacementMarkdown,
          } satisfies HistoryEntry;
        } catch (error) {
          const nextError = error instanceof Error ? error : new Error(String(error));
          onErrorRef.current?.(nextError);
          return null;
        } finally {
          suppressHistoryRef.current = false;
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
        insertLink() {
          runActiveInputCommand(() => activeInputRef.current?.insertLink("link", "https://"));
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
        runActiveInputCommand,
        save,
        saveAs,
        undo,
      ],
    );

    useImperativeHandle(ref, () => commands, [commands]);
    useImperativeHandle(commandsRef, () => commands, [commands]);

    const blockSelectionRects = useMemo(() => {
      return getBlockSelectionRects({
        blockIds,
        blockSelection,
        layoutsByBlockId: blockContentLayoutsRef.current,
      });
    }, [blockIds, blockSelection, layoutVersion]);
    const blockSelectionAnchor = useMemo<MarkdownSelectionAnchor | null>(() => {
      if (blockSelectionRects.length === 0) {
        return null;
      }

      const firstRect = blockSelectionRects.reduce((closestRect, rect) => (
        rect.y < closestRect.y ? rect : closestRect
      ), blockSelectionRects[0]);
      if (!firstRect) {
        return null;
      }

      return {
        blockId: firstRect.blockId,
        height: firstRect.height,
        itemHeight: firstRect.height,
        itemWidth: inactiveOverlayWidth,
        itemX: resolvedContentHorizontalPadding,
        itemY: firstRect.y + scrollOffsetYRef.current,
        kind: "blockSelection",
        width: inactiveOverlayWidth,
        x: resolvedContentHorizontalPadding,
        y: firstRect.y + scrollOffsetYRef.current,
      };
    }, [blockSelectionRects, inactiveOverlayWidth, resolvedContentHorizontalPadding]);
    const selectedBlockIds = useMemo(() => {
      const selectedIds = new Set<string>();
      if (!blockSelection) {
        return selectedIds;
      }

      const anchorIndex = blockIds.indexOf(blockSelection.anchorBlockId);
      const focusIndex = blockIds.indexOf(blockSelection.focusBlockId);
      if (anchorIndex >= 0 && focusIndex >= 0) {
        const startIndex = Math.min(anchorIndex, focusIndex);
        const endIndex = Math.max(anchorIndex, focusIndex);
        for (let index = startIndex; index <= endIndex; index += 1) {
          const blockId = blockIds[index];
          if (blockId) {
            selectedIds.add(blockId);
          }
        }
      }

      return selectedIds;
    }, [blockIds, blockSelection]);
    const selectionAnchor = blockSelectionAnchor ?? textSelectionAnchor;
    useEffect(() => {
      onSelectionAnchorChange?.(selectionAnchor);
    }, [onSelectionAnchorChange, selectionAnchor]);
    useEffect(() => {
      return () => onSelectionAnchorChange?.(null);
    }, [onSelectionAnchorChange]);
    const listExtraData = useMemo(
      () => ({
        activeBlockId,
        activeSelection,
        blockIds,
        blocksById,
        commentAnchor,
        renderCommentBubble,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
        selectedBlockIds,
      }),
      [activeBlockId, activeSelection, blockIds, blocksById, commentAnchor, renderCommentBubble, resolvedMarkdownLayout, resolvedMarkdownStyle, selectedBlockIds],
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
      (props: LegendListRenderItemProps<string>) => (
        <MarkdownBlockRow
          {...props}
          activeInputRef={activeInputRef}
          block={blocksById.get(props.item)}
          draftMarkdown={activeBlockId === props.item ? draftMarkdown : ""}
          hasNextBlock={props.index + 1 < blockIds.length}
          hasPreviousBlock={props.index > 0}
          initialSelection={activeSelection}
          isActive={activeBlockId === props.item}
          isBlockSelected={selectedBlockIds.has(props.item)}
          commentAnchor={commentAnchor?.blockId === props.item ? commentAnchor : null}
          markdownLayout={resolvedMarkdownLayout}
          markdownStyle={resolvedMarkdownStyle}
          onActivate={activateBlock}
          onBlockWindowLayout={handleBlockWindowLayout}
          onBlurRef={handleEditorBlurRef}
          onChangeMarkdownRef={handleChangeMarkdownRef}
          onChangeSelectionRef={handleChangeSelectionRef}
          onSelectionDragOutsideRef={handleSelectionDragOutsideRef}
          previousBlock={blocksById.get(blockIds[props.index - 1] ?? "")}
          renderCommentBubble={renderCommentBubble}
          selectionOverlayStyle={blockSelectionOverlayStyle}
        />
      ),
      [
        activateBlock,
        activeBlockId,
        activeSelection,
        blockIds,
        blocksById,
        commentAnchor,
        draftMarkdown,
        handleBlockWindowLayout,
        handleEditorBlurRef,
        handleChangeMarkdownRef,
        handleChangeSelectionRef,
        handleSelectionDragOutsideRef,
        renderCommentBubble,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
        selectedBlockIds,
        blockSelectionOverlayStyle,
      ],
    );
    const selectionToolbarFooter = useMemo(() => {
      return selectionToolbarAnchor && renderSelectionToolbar ? (
        <View pointerEvents="box-none" style={styles.selectionToolbarFooterContent}>
          {renderSelectionToolbar(selectionToolbarAnchor)}
        </View>
      ) : null;
    }, [renderSelectionToolbar, selectionToolbarAnchor]);
    const handleListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      scrollViewportHeightRef.current = event.nativeEvent.layoutMeasurement.height;
    }, []);
    const activeBlock = activeBlockId ? blocksById.get(activeBlockId) : undefined;
    const handleNativeBeginEditing = useCallback(
      (event: { nativeEvent: { blockId: string; height: number; width: number; x: number; y: number } }) => {
        const { blockId, height, width, x, y } = event.nativeEvent;
        const block = blocksById.get(blockId);
        nativeEditingBlockIdRef.current = blockId;
        if (block) {
          const nextOverlayFrame = {
            height,
            left: x,
            top: y,
            width,
          };
          overlayFrameRef.current = nextOverlayFrame;
          setOverlayFrame(nextOverlayFrame);
          if (activeBlockIdRef.current !== blockId) {
            activateBlock(block, 0);
          }
        }
      },
      [activateBlock, blocksById],
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
        <TextInput
          ref={blockSelectionInputRef}
          autoCorrect={false}
          multiline={false}
          onChangeText={handleBlockSelectionInputChange}
          onKeyPress={handleBlockSelectionKeyPress}
          style={styles.blockSelectionInput}
          value={blockSelectionInputText}
        />
        <LegendList
          ref={listRef}
          alwaysRender={alwaysRenderActiveBlock}
          contentContainerStyle={contentStyle}
          data={blockIds}
          estimatedItemSize={estimatedItemSize}
          extraData={listExtraData}
          keyExtractor={(item) => item}
          ListFooterComponent={selectionToolbarFooter}
          ListFooterComponentStyle={styles.selectionToolbarFooter}
          onLoad={() => {
            hydrateRemainingBlocks(documentState.snapshot, loadVersionRef.current);
          }}
          onScroll={handleListScroll}
          recycleItems
          renderItem={renderMarkdownBlockRow}
          style={styles.list}
        />
      </>
    );
    const containerStyle = [styles.container, theme?.backgroundColor ? { backgroundColor: theme.backgroundColor } : null, style];

    if (usesNativeEditorOverlay) {
      return (
        <MarkdownEditorHost
          ref={containerRef}
          activeBlockId={activeBlockId ?? ""}
          activeMarkdown={activeBlockId ? draftMarkdown : ""}
          onBeginEditing={handleNativeBeginEditing}
          onLayout={measureContainerWindowLayout}
          style={containerStyle}
        >
          {documentContent}
          <MarkdownOverlayEditorInput
            activeBlock={activeBlock}
            activeInputRef={activeInputRef}
            inactiveOverlayWidth={inactiveOverlayWidth}
            markdownStyle={resolvedMarkdownStyle}
            onBlurRef={handleEditorBlurRef}
            onChangeMarkdownRef={handleChangeMarkdownRef}
            onChangeSelectionRef={handleChangeSelectionRef}
            onSelectionDragOutsideRef={handleSelectionDragOutsideRef}
            overlayFrame={overlayFrame}
            sourceBlockIdRef={nativeEditingBlockIdRef}
          />
        </MarkdownEditorHost>
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
