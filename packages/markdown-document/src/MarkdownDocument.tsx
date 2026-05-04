import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
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
} from "react-native";
import { nativeMarkdownDocumentAdapter } from "./adapters/nativeMarkdownDocumentAdapter";
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
} from "./internalTypes";
import {
  resolveSelectionColor,
  splitMarkdownAtFirstLineBreak,
} from "./markdownLayout";
import { defaultMarkdownLayout, defaultMarkdownStyle } from "./styles";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentCommands,
  MarkdownDocumentProps,
  MarkdownDocumentSnapshot,
  MarkdownSaveState,
  MarkdownTransactionResult,
} from "./types";
import { useLatestRef } from "./useLatestRef";

export const MarkdownDocument = forwardRef<MarkdownDocumentCommands, MarkdownDocumentProps>(
  (
    {
      adapter = nativeMarkdownDocumentAdapter,
      autoFocusFirstBlock,
      commandsRef,
      contentContainerStyle,
      filename,
      markdownLayout,
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
    const containerRef = useRef<View>(null);
    const activeInputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
    const editTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const saveRef = useRef<(() => Promise<void>) | undefined>(undefined);
    const saveInFlightRef = useRef<Promise<void> | undefined>(undefined);
    const activeBlockIdRef = useRef<string | null>(null);
    const blockSelectionInputRef = useRef<TextInput | null>(null);
    const blockSelectionGestureRef = useRef<BlockSelectionState | null>(null);
    const nativeEditingBlockIdRef = useRef<string | null>(null);
    const blockWindowLayoutsRef = useRef(new Map<string, BlockLayout>());
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
    const [blockSelection, setBlockSelection] = useState<BlockSelectionState | null>(null);
    const blockSelectionRef = useRef<BlockSelectionState | null>(null);
    const [blockSelectionInputText, setBlockSelectionInputText] = useState("");
    const [containerWindowY, setContainerWindowY] = useState(0);
    const [draftMarkdown, setDraftMarkdown] = useState("");
    const [layoutVersion, setLayoutVersion] = useState(0);
    const [overlayFrame, setOverlayFrame] = useState<OverlayFrame | undefined>(undefined);
    const [inactiveOverlayWidth, setInactiveOverlayWidth] = useState(contentMaxWidth - contentHorizontalPadding * 2);
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

    const setNextBlockSelection = useCallback((nextBlockSelection: BlockSelectionState | null) => {
      blockSelectionRef.current = nextBlockSelection;
      setBlockSelection(nextBlockSelection);
    }, []);

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

    const updateRenderedBlockMarkdown = useCallback((blockId: string, markdown: string) => {
      setBlocksById((previousBlocksById) => {
        const block = previousBlocksById.get(blockId);
        if (!block || block.markdown === markdown) {
          return previousBlocksById;
        }

        const nextBlocksById = new Map(previousBlocksById);
        nextBlocksById.set(blockId, {
          ...block,
          contentEndByte: block.contentStartByte !== undefined ? block.contentStartByte + markdown.length : block.contentEndByte,
          markdown,
          sourceEndByte: block.sourceStartByte + markdown.length,
          textRevision: block.textRevision + 1,
        });
        return nextBlocksById;
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
        if (updateReactState) {
          updateRenderedBlockMarkdown(activeBlockIdValue, committedMarkdownRef.current);
        }
        const nextError = error instanceof Error ? error : new Error(String(error));
        onErrorRef.current?.(nextError);
      }
    }, [adapter, applyTransactionResult, clearEditTimer, documentState, onErrorRef, updateRenderedBlockMarkdown]);

    const activateBlock = useCallback(
      (block: MarkdownBlockSnapshot, selection: number) => {
        void commitActiveBlock({ updateReactState: true });
        blockSelectionGestureRef.current = null;
        setNextBlockSelection(null);
        nativeEditingBlockIdRef.current = block.id;
        activeBlockIdRef.current = block.id;
        draftMarkdownRef.current = block.markdown;
        committedMarkdownRef.current = block.markdown;
        setDraftMarkdown(block.markdown);
        setActiveSelection(selection);
        setActiveBlockId(block.id);
      },
      [commitActiveBlock],
    );

    const beginBlockSelection = useCallback(
      (anchorBlockId: string, focusBlockId: string) => {
        const activeBlockIdValue = activeBlockIdRef.current;
        void commitActiveBlock({ updateReactState: true });
        if (activeBlockIdValue && activeBlockIdValue !== anchorBlockId) {
          activeInputRef.current?.blur();
          nativeEditingBlockIdRef.current = null;
          activeBlockIdRef.current = null;
          setActiveBlockId(null);
          setActiveSelection(0);
        }
        const nextBlockSelection = { anchorBlockId, focusBlockId };
        blockSelectionGestureRef.current = nextBlockSelection;
        setNextBlockSelection(nextBlockSelection);
      },
      [commitActiveBlock, setNextBlockSelection],
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

    const blockIdAtWindowY = useCallback((y: number) => {
      const layouts = blockIds
        .map((blockId) => {
          const layout = blockWindowLayoutsRef.current.get(blockId);
          return layout ? { blockId, layout } : undefined;
        })
        .filter((entry): entry is { blockId: string; layout: BlockLayout } => entry !== undefined)
        .sort((a, b) => a.layout.y - b.layout.y);

      for (let index = 0; index < layouts.length; index += 1) {
        const entry = layouts[index];
        if (!entry) {
          continue;
        }

        const previousEntry = layouts[index - 1];
        const nextEntry = layouts[index + 1];
        const blockTop = entry.layout.y;
        const blockBottom = entry.layout.y + entry.layout.height;
        const hitTop = previousEntry
          ? (previousEntry.layout.y + previousEntry.layout.height + blockTop) / 2
          : Number.NEGATIVE_INFINITY;
        const hitBottom = nextEntry
          ? (blockBottom + nextEntry.layout.y) / 2
          : Number.POSITIVE_INFINITY;

        if (y >= hitTop && y < hitBottom) {
          return entry.blockId;
        }
      }

      return undefined;
    }, [blockIds]);

    const handleBlockWindowLayout = useCallback((blockId: string, layout: BlockLayout) => {
      const previousLayout = blockWindowLayoutsRef.current.get(blockId);
      if (previousLayout?.y === layout.y && previousLayout.height === layout.height) {
        return;
      }
      blockWindowLayoutsRef.current.set(blockId, layout);
      setLayoutVersion((version) => version + 1);
    }, []);

    const measureContainerWindowLayout = useCallback((event?: LayoutChangeEvent) => {
      if (event) {
        const nextContentWidth = Math.max(
          1,
          Math.min(event.nativeEvent.layout.width, contentMaxWidth) - contentHorizontalPadding * 2,
        );
        setInactiveOverlayWidth(nextContentWidth);
      }
      requestAnimationFrame(() => {
        containerRef.current?.measureInWindow((_x, y) => {
          setContainerWindowY(y);
        });
      });
    }, []);

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

        const targetBlockId = typeof event.windowY === "number" ? blockIdAtWindowY(event.windowY) : undefined;
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
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "splitBlock",
            blockId: block.id,
            beforeMarkdown,
            afterMarkdown,
          });
          applyTransactionResult(result);

          const nextActiveBlockId = result.changedRange.blockIds[1] ?? result.changedRange.blockIds[0] ?? block.id;
          activeBlockIdRef.current = nextActiveBlockId;
          nativeEditingBlockIdRef.current = nextActiveBlockId;
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
        setDraftMarkdown(markdown);
        if (usesNativeEditorOverlay) {
          updateRenderedBlockMarkdown(block.id, markdown);
        }
        markDirty();
        clearEditTimer();
        editTimerRef.current = setTimeout(() => {
          void commitActiveBlock({ updateReactState: false });
        }, editDebounceMs);
      },
      [clearEditTimer, commitActiveBlock, markDirty, splitActiveBlock, updateRenderedBlockMarkdown],
    );
    const handleChangeMarkdownRef = useLatestRef(handleChangeMarkdown);

    const handleEditorBlur = useCallback(() => {
      const blurredBlockId = activeBlockIdRef.current;
      void (async () => {
        await commitActiveBlock({ updateReactState: true });
        if (activeBlockIdRef.current !== blurredBlockId) {
          return;
        }
        nativeEditingBlockIdRef.current = null;
        activeBlockIdRef.current = null;
        setActiveBlockId(null);
        setActiveSelection(0);
      })();
    }, [commitActiveBlock]);
    const handleEditorBlurRef = useLatestRef(handleEditorBlur);

    const replaceBlockSelection = useCallback(
      async (markdown: string) => {
        if (documentState.status !== "loaded" || !adapter.applyTransaction || !blockSelection) {
          return;
        }

        const anchorIndex = blockIds.indexOf(blockSelection.anchorBlockId);
        const focusIndex = blockIds.indexOf(blockSelection.focusBlockId);
        if (anchorIndex < 0 || focusIndex < 0) {
          return;
        }

        const startIndex = Math.min(anchorIndex, focusIndex);
        const endIndex = Math.max(anchorIndex, focusIndex);
        const startBlockId = blockIds[startIndex];
        const endBlockId = blockIds[endIndex];
        if (!startBlockId || !endBlockId) {
          return;
        }

        const selectedMarkdown: string[] = [];
        for (let index = startIndex; index <= endIndex; index += 1) {
          const block = blocksById.get(blockIds[index] ?? "");
          if (!block) {
            return;
          }
          selectedMarkdown.push(block.markdown);
        }

        clearEditTimer();
        try {
          const result = await adapter.applyTransaction(documentState.snapshot.documentId, {
            type: "replaceBlockRange",
            startBlockId,
            endBlockId,
            markdown,
          });
          const firstChangedBlockId = result.changedRange.blockIds[0];
          const lastChangedBlockId = result.changedRange.blockIds[result.changedRange.blockIds.length - 1];
          if (!suppressHistoryRef.current && firstChangedBlockId && lastChangedBlockId) {
            undoStackRef.current.push({
              type: "replaceBlockRange",
              startBlockId: firstChangedBlockId,
              endBlockId: lastChangedBlockId,
              replacementMarkdown: selectedMarkdown.join("\n"),
              inverseMarkdown: markdown,
            });
            redoStackRef.current = [];
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
        documentState,
        markDirty,
        onErrorRef,
      ],
    );

    const handleBlockSelectionKeyPress = useCallback(
      (event: { nativeEvent: { key: string } }) => {
        if (!blockSelection) {
          return;
        }

        const { key } = event.nativeEvent;
        if (key === "Backspace" || key === "Delete" || key === "Enter") {
          void replaceBlockSelection("");
        }
      },
      [blockSelection, replaceBlockSelection],
    );

    const handleBlockSelectionInputChange = useCallback(
      (text: string) => {
        setBlockSelectionInputText("");
        if (blockSelection && text.length > 0) {
          void replaceBlockSelection(text);
        }
      },
      [blockSelection, replaceBlockSelection],
    );

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
      blockWindowLayoutsRef.current.clear();
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
      blockSelectionGestureRef.current = null;
      nativeEditingBlockIdRef.current = null;
      setDocumentState({ status: "loading" });
      setBlockIds([]);
      setBlocksById(new Map());
      setActiveBlockId(null);
      setActiveSelection(0);
      setNextBlockSelection(null);
      setBlockSelectionInputText("");
      setDraftMarkdown("");
      setOverlayFrame(undefined);
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
        void adapter.close(loadedDocumentId);
      };
    }, [adapter, loadedDocumentId]);

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

        clearAutosaveTimer();
        autosavePausedRef.current = false;
        setNextSaveState("saving");

        const savePromise = (async () => {
          await commitActiveBlock({ updateReactState: false });
          if (saveFilename) {
            await adapter.saveAs(documentState.snapshot.documentId, saveFilename);
          } else {
            await adapter.save(documentState.snapshot.documentId);
          }
          savedRevisionRef.current = currentRevisionRef.current;
          setNextSaveState("idle");
          isDirtyRef.current = currentRevisionRef.current !== savedRevisionRef.current;
          onDirtyChangeRef.current?.(isDirtyRef.current);
        })();
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
      void (async () => {
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
      })();
    }, [applyHistoryEntry, commitActiveBlock]);

    const redo = useCallback(() => {
      void (async () => {
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
        saveAs,
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
      [redo, save, saveAs, undo],
    );

    useImperativeHandle(ref, () => commands, [commands]);
    useImperativeHandle(commandsRef, () => commands, [commands]);

    const resolvedMarkdownLayout = markdownLayout ?? defaultMarkdownLayout;
    const resolvedMarkdownStyle = markdownStyle ?? defaultMarkdownStyle;
    const blockSelectionRects = useMemo(() => {
      const rects: { blockId: string; height: number; y: number }[] = [];
      if (!blockSelection) {
        return rects;
      }

      const anchorIndex = blockIds.indexOf(blockSelection.anchorBlockId);
      const focusIndex = blockIds.indexOf(blockSelection.focusBlockId);
      if (anchorIndex < 0 || focusIndex < 0) {
        return rects;
      }

      const startIndex = Math.min(anchorIndex, focusIndex);
      const endIndex = Math.max(anchorIndex, focusIndex);
      for (let index = startIndex; index <= endIndex; index += 1) {
        const blockId = blockIds[index];
        const layout = blockId ? blockWindowLayoutsRef.current.get(blockId) : undefined;
        if (blockId && layout) {
          rects.push({
            blockId,
            height: layout.height,
            y: layout.y - containerWindowY,
          });
        }
      }
      return rects;
    }, [blockIds, blockSelection, containerWindowY, layoutVersion]);
    const listExtraData = useMemo(
      () => ({
        activeBlockId,
        activeSelection,
        blockIds,
        blocksById,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
      }),
      [activeBlockId, activeSelection, blockIds, blocksById, resolvedMarkdownLayout, resolvedMarkdownStyle],
    );
    const alwaysRenderActiveBlock = useMemo(
      () => (activeBlockId ? { keys: [activeBlockId] } : undefined),
      [activeBlockId],
    );
    const contentStyle = useMemo(
      () => [styles.contentContainer, contentContainerStyle],
      [contentContainerStyle],
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
          markdownLayout={resolvedMarkdownLayout}
          markdownStyle={resolvedMarkdownStyle}
          onActivate={activateBlock}
          onBlockWindowLayout={handleBlockWindowLayout}
          onBlurRef={handleEditorBlurRef}
          onChangeMarkdownRef={handleChangeMarkdownRef}
          onSelectionDragOutsideRef={handleSelectionDragOutsideRef}
          previousBlock={blocksById.get(blockIds[props.index - 1] ?? "")}
        />
      ),
      [
        activateBlock,
        activeBlockId,
        activeSelection,
        blockIds,
        blocksById,
        draftMarkdown,
        handleBlockWindowLayout,
        handleEditorBlurRef,
        handleChangeMarkdownRef,
        handleSelectionDragOutsideRef,
        resolvedMarkdownLayout,
        resolvedMarkdownStyle,
      ],
    );
    const activeBlock = activeBlockId ? blocksById.get(activeBlockId) : undefined;
    const handleNativeBeginEditing = useCallback(
      (event: { nativeEvent: { blockId: string; height: number; width: number; x: number; y: number } }) => {
        const { blockId, height, width, x, y } = event.nativeEvent;
        const block = blocksById.get(blockId);
        nativeEditingBlockIdRef.current = blockId;
        if (block) {
          setOverlayFrame({
            height,
            left: x,
            top: y,
            width,
          });
          activateBlock(block, 0);
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
        {blockSelectionRects.map((rect) => (
          <View
            key={rect.blockId}
            pointerEvents="none"
            style={[
              blockSelectionOverlayStyle,
              {
                height: rect.height,
                top: rect.y,
              },
            ]}
          />
        ))}
        <LegendList
          alwaysRender={alwaysRenderActiveBlock}
          contentContainerStyle={contentStyle}
          data={blockIds}
          estimatedItemSize={estimatedItemSize}
          extraData={listExtraData}
          keyExtractor={(item) => item}
          onLoad={() => {
            hydrateRemainingBlocks(documentState.snapshot, loadVersionRef.current);
          }}
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
