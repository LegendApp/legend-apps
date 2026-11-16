import { useWindowId } from "@legendapp/spark/windows";
import { type Observable } from "@legendapp/state";
import type { RefObject } from "react";
import { useCallback, useEffect } from "react";
import { type UnsavedDiffMergeDraftReason, confirmUnsavedDiffMergeDrafts } from "../confirmUnsavedDiffMergeDrafts";
import { registerDiffWindowExitPreparation } from "../diffAppExit";
import { getDiffSourceLabel } from "../diffFiles";
import { type DiffMergeConflictBlock, type DiffMergeConflictChoice, type DiffMergeConflictFile, type DiffMergeState, createDiffMergeDraftFileWithResolvedBlock, createReadyMergeState, loadDiffMergeState, readDiffMergeFileContent, resolveDiffMergeConflictContent } from "../diffMerge";
import { getMergeConflictKey, isDiffMergeSavePending } from "../diffMergeControls";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { createRefreshError, getErrorMessage } from "../viewer/diffViewerSupport";
import { type DiffMergeDraftFile, type DiffMergeFileResolveQueue } from "./diffWindowTypes";
import { getDiffSourceCacheKey } from "./useDiffSourceLoader";

export function clearDiffMergeDraftFlag(file: DiffMergeConflictFile) {
    if (!file.hasUnsavedDraft) {
        return file;
    }
    const { hasUnsavedDraft: _hasUnsavedDraft, ...savedFile } = file;
    return savedFile;
}

export function getUnsavedDiffMergeDraftFiles(mergeState: DiffMergeState) {
    return mergeState.status === "ready" ? mergeState.files.filter((file) => file.hasUnsavedDraft) : [];
}
export function useDiffMergeDrafts({
    mergeDraftsRef,
    mergeState$,
    state$,
    resolvingMergeConflictKeys$,
    savingMergeDraftsRef,
    setResolvingMergeConflictKeyActive,
    setDocumentErrorValue,
    mergeResolveQueuesRef,
    mergeDraftsSourceKeyRef,
    setMergeStateValue,
    waitForMergeResolveQueues,
    hasUnsavedMergeDrafts,
    saveMergeDrafts,
    prepareMergeDraftsForTransitionRef,
    windowIdentifier,
}: {
    mergeDraftsRef: RefObject<Map<string, DiffMergeDraftFile>>;
    mergeState$: DiffViewerModel["mergeState$"];
    state$: DiffViewerModel["state$"];
    resolvingMergeConflictKeys$: Observable<Set<string>>;
    savingMergeDraftsRef: RefObject<boolean>;
    setResolvingMergeConflictKeyActive: (key: string, active: boolean) => void;
    setDocumentErrorValue: DiffViewerModel["setDocumentErrorValue"];
    mergeResolveQueuesRef: RefObject<Map<string, DiffMergeFileResolveQueue>>;
    mergeDraftsSourceKeyRef: RefObject<string | null>;
    setMergeStateValue: DiffViewerModel["setMergeStateValue"];
    waitForMergeResolveQueues: () => Promise<void>;
    hasUnsavedMergeDrafts: boolean;
    saveMergeDrafts: () => Promise<boolean>;
    prepareMergeDraftsForTransitionRef: RefObject<(reason: UnsavedDiffMergeDraftReason) => Promise<boolean>>;
    windowIdentifier: ReturnType<typeof useWindowId>;
}) {
    "use no memo";
    const getCurrentMergeFileForResolve = useCallback((path: string) => {
        const existingDraft = mergeDraftsRef.current.get(path);
        if (existingDraft) {
            return existingDraft.file;
        }
        const currentMergeState = mergeState$.peek();
        return currentMergeState.status === "ready" ? currentMergeState.fileByPath.get(path) ?? null : null;
    }, [mergeState$]);
    const resolveMergeConflict = useCallback((file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => {
        const currentState = state$.peek();
        const resolvingKeys = resolvingMergeConflictKeys$.peek();
        const conflictKey = getMergeConflictKey(file, block);
        if (currentState.status === "loaded" &&
            currentState.source.kind === "folder" &&
            !savingMergeDraftsRef.current &&
            !isDiffMergeSavePending(resolvingKeys) &&
            !resolvingKeys.has(conflictKey)) {
            setResolvingMergeConflictKeyActive(conflictKey, true);
            setDocumentErrorValue(null);
            const originalBlockIndex = Math.max(0, file.markerBlocks.findIndex((candidate) => candidate === block || candidate.startLine === block.startLine));
            const queue = mergeResolveQueuesRef.current.get(file.path) ?? {
                chain: Promise.resolve(),
                completedOriginalBlockIndexes: [],
            };
            const runResolve = async () => {
                try {
                    const existingDraft = mergeDraftsRef.current.get(file.path);
                    const currentFile = getCurrentMergeFileForResolve(file.path) ?? file;
                    const resolvedEarlierBlocks = queue.completedOriginalBlockIndexes.filter((index) => index < originalBlockIndex).length;
                    const currentBlockIndex = Math.max(0, originalBlockIndex - resolvedEarlierBlocks);
                    const currentBlock = currentFile.markerBlocks[currentBlockIndex] ?? currentFile.markerBlocks.find((candidate) => (candidate.oursLines.length === block.oursLines.length &&
                        candidate.theirsLines.length === block.theirsLines.length &&
                        candidate.oursLines.every((line, index) => line === block.oursLines[index]) &&
                        candidate.theirsLines.every((line, index) => line === block.theirsLines[index])));
                    if (!currentBlock) {
                        throw new Error(`Unable to find conflict block in ${file.path}.`);
                    }
                    const currentContent = existingDraft?.content ?? await readDiffMergeFileContent({
                        folderPath: currentState.source.value,
                        path: file.path,
                    });
                    const resolvedContent = resolveDiffMergeConflictContent(currentContent, currentBlock.startLine, choice);
                    const nextFile = createDiffMergeDraftFileWithResolvedBlock({
                        block: currentBlock,
                        choice,
                        content: resolvedContent,
                        file: currentFile,
                    });
                    const nextDrafts = new Map(mergeDraftsRef.current);
                    nextDrafts.set(file.path, {
                        content: resolvedContent,
                        file: nextFile,
                    });
                    mergeDraftsRef.current = nextDrafts;
                    mergeDraftsSourceKeyRef.current = getDiffSourceCacheKey(currentState.source);
                    const currentMergeState = mergeState$.peek();
                    if (currentMergeState.status === "ready") {
                        setMergeStateValue(createReadyMergeState(currentMergeState.files
                            .map((currentFile) => currentFile.path === file.path ? nextFile : currentFile)
                            .filter((currentFile) => currentFile.markerBlocks.length > 0 || currentFile.hasUnsavedDraft)));
                    }
                    queue.completedOriginalBlockIndexes.push(originalBlockIndex);
                }
                catch (error: unknown) {
                    setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
                }
                finally {
                    setResolvingMergeConflictKeyActive(conflictKey, false);
                }
            };
            const nextChain = queue.chain
                .catch(() => undefined)
                .then(runResolve);
            queue.chain = nextChain;
            mergeResolveQueuesRef.current.set(file.path, queue);
            nextChain.finally(() => {
                if (mergeResolveQueuesRef.current.get(file.path)?.chain === nextChain) {
                    mergeResolveQueuesRef.current.delete(file.path);
                }
            });
        }
    }, [
        getCurrentMergeFileForResolve,
        mergeState$,
        setDocumentErrorValue,
        setMergeStateValue,
        setResolvingMergeConflictKeyActive,
        state$,
        resolvingMergeConflictKeys$,
    ]);
    const discardMergeDrafts = useCallback(async () => {
        await waitForMergeResolveQueues();
        const currentState = state$.peek();
        if (currentState.status !== "loaded" || currentState.source.kind !== "folder") {
            return false;
        }
        mergeDraftsRef.current = new Map();
        mergeDraftsSourceKeyRef.current = null;
        const nextMergeState = await loadDiffMergeState(currentState.source.value);
        setMergeStateValue(nextMergeState);
        return true;
    }, [setMergeStateValue, state$, waitForMergeResolveQueues]);
    const discardMergeDraftsFromCommand = useCallback(() => {
        if (hasUnsavedMergeDrafts && !savingMergeDraftsRef.current) {
            discardMergeDrafts().catch((error: unknown) => {
                const currentState = state$.peek();
                if (currentState.status === "loaded") {
                    setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
                }
            });
        }
    }, [discardMergeDrafts, hasUnsavedMergeDrafts, setDocumentErrorValue, state$]);
    const prepareMergeDraftsForTransition = useCallback(async (reason: UnsavedDiffMergeDraftReason) => {
        await waitForMergeResolveQueues();
        const currentState = state$.peek();
        const draftFiles = getUnsavedDiffMergeDraftFiles(mergeState$.peek());
        if (currentState.status !== "loaded" || draftFiles.length === 0) {
            return true;
        }
        const action = await confirmUnsavedDiffMergeDrafts({
            fileCount: draftFiles.length,
            reason,
            sourceLabel: getDiffSourceLabel(currentState.source),
        });
        if (action === "discard") {
            return true;
        }
        if (action === "save") {
            return saveMergeDrafts();
        }
        return false;
    }, [mergeState$, saveMergeDrafts, state$, waitForMergeResolveQueues]);
    prepareMergeDraftsForTransitionRef.current = prepareMergeDraftsForTransition;
    useEffect(() => registerDiffWindowExitPreparation(windowIdentifier, prepareMergeDraftsForTransition), [prepareMergeDraftsForTransition, windowIdentifier]);
    return { resolveMergeConflict, discardMergeDraftsFromCommand };
}
