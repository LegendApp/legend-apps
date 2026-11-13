import { type DiffDocument, type DiffLoadSession, type DiffLoadStatus, loadUnifiedDiff, loadUnifiedDiffFile, loadUnifiedDiffFromUrl, startGitFolderDiff, startUnifiedDiffFromUrl } from "@legend-apps/diff-parser";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { nowMs } from "@legend-apps/source-viewer";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import { runCommand } from "@legendapp/spark/processes";
import { useWindowId } from "@legendapp/spark/windows";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { type UnsavedDiffMergeDraftReason } from "../confirmUnsavedDiffMergeDrafts";
import { addRecentDiffSource, updateSavedDiffWindowSource } from "../diffAppMetadata";
import { type DiffOpenSource, getDiffFolderCompareBaseKey, getDiffRecentDocumentPath, isDiffGitSource } from "../diffFiles";
import { type DiffMergeState, createReadyMergeState, loadDiffMergeState } from "../diffMerge";
import { readDiffGitSource } from "../git/diffGitSource";
import { getDiffIgnoreWhitespaceChangesSetting, getDiffShowOnlyHunksSetting } from "../diffSettings";
import { createFilePairDiffCommand, createFilePairUnifiedDiff } from "../filePairDiff";
import { getActiveDiffFile } from "../viewer/diffFilePresentation";
import { diffInitialRowCount, diffLoadedCacheMaxRows, diffProgressiveInitialPaintMaxDelayMs, diffProgressiveInitialPaintRowCount, diffProgressiveLoadPollMs, diffProgressivePostInitialLoadPollMs, diffProgressivePostInitialLoadResumeMs } from "../viewer/diffViewerConstants";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { type DiffLoadProgressState, type DiffLoadSourceOptions, type DiffLoadTrace, type DiffViewerState, emptyDiffLoadProgressState, emptyDiffViewerState, unavailableDiffMergeState } from "../viewer/diffViewerModel";
import { createOpenError, createRefreshError, getErrorMessage, shouldPrepareMergeDraftsForSourceChange, sourcesMatch } from "../viewer/diffViewerSupport";
import { type DiffLoadedCacheEntry, type DiffLoadedPayload, type DiffMergeDraftFile, type DiffMergeFileResolveQueue } from "./diffWindowTypes";

export function disposeDiffDocument(document: DiffDocument, reason: string) {
    document.cancelTokenizationRequests(reason);
    document.releaseNativeResources();
}

function disposeLoadedCacheEntry(entry: DiffLoadedCacheEntry | undefined, reason: string) {
    if (entry) {
        disposeDiffDocument(entry.loaded.document, reason);
    }
}

function deleteLoadedCacheEntry(cache: Map<string, DiffLoadedCacheEntry>, key: string, reason: string) {
    disposeLoadedCacheEntry(cache.get(key), reason);
    cache.delete(key);
}

export function clearLoadedCache(cache: Map<string, DiffLoadedCacheEntry>, reason: string) {
    for (const entry of cache.values()) {
        disposeDiffDocument(entry.loaded.document, reason);
    }
    cache.clear();
}

export function deleteLoadedCacheEntriesWithPrefix(cache: Map<string, DiffLoadedCacheEntry>, prefix: string, reason: string) {
    for (const key of Array.from(cache.keys())) {
        if (key.startsWith(prefix)) {
            deleteLoadedCacheEntry(cache, key, reason);
        }
    }
}

function waitForDiffProgressPoll(delayMs = diffProgressiveLoadPollMs) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
    });
}

function shouldPublishInitialProgress(progress: DiffLoadStatus, initialRowCount: number, elapsedMs: number) {
    if (progress.complete || progress.error || (initialRowCount > 0 && progress.rowCount > 0)) {
        return true;
    }
    if (initialRowCount <= 0 && progress.fileCount > 0) {
        const rowCount = Math.max(0, Math.floor(progress.rowCount));
        return rowCount >= diffProgressiveInitialPaintRowCount ||
            elapsedMs >= diffProgressiveInitialPaintMaxDelayMs;
    }
    return false;
}

function getDiffLoadProgressState(source: DiffOpenSource, requestId: number, progress: DiffLoadStatus): DiffLoadProgressState {
    return {
        complete: progress.complete,
        fileCount: Math.max(0, Math.floor(progress.fileCount)),
        fileVersion: progress.fileVersion,
        requestId,
        rowCount: Math.max(0, Math.floor(progress.rowCount)),
        rowVersion: progress.rowVersion,
        source,
        visible: !progress.complete && !progress.error,
    };
}

export function getDiffSourceCacheKey(source: DiffOpenSource) {
    if (source.kind === "github") {
        return `${source.kind}:${source.diffUrl}`;
    }
    if (source.kind === "git") {
        return `${source.kind}:${source.cwd}:${source.args.join("\u0000")}`;
    }
    if (source.kind === "filePair") {
        return `${source.kind}:${source.oldPath}\u0000${source.newPath}`;
    }
    if (source.kind === "diffFile") {
        return `${source.kind}:${source.value}`;
    }
    return source.kind === "folder"
        ? `${source.kind}:${source.value}:${getDiffFolderCompareBaseKey(source.compareBase)}`
        : `${source.kind}:${source.value}`;
}

function getDiffLoadedCacheKey(source: DiffOpenSource, showOnlyHunks: boolean, ignoreWhitespaceChanges: boolean) {
    const mode = showOnlyHunks ? "hunks" : "full";
    const whitespace = ignoreWhitespaceChanges ? "ignore-whitespace" : "include-whitespace";
    return `${getDiffSourceCacheKey(source)}:${mode}:${whitespace}`;
}

function getDiffGitFolderLoadCompareOptions(source: DiffOpenSource) {
    if (source.kind === "folder" && source.compareBase?.kind === "ref") {
        return {
            compareBaseKind: "ref",
            compareBaseRef: source.compareBase.ref,
            compareUseMergeBase: source.compareBase.useMergeBase !== false,
        };
    }
    return {
        compareBaseKind: "head",
        compareBaseRef: "",
        compareUseMergeBase: true,
    };
}

function shouldCacheLoadedDiff(loaded: DiffLoadedPayload) {
    return loaded.document.rowCount <= diffLoadedCacheMaxRows;
}

function applyDiffMergeDraftsToState(mergeState: DiffMergeState, drafts: ReadonlyMap<string, DiffMergeDraftFile>): DiffMergeState {
    if (mergeState.status !== "ready" || drafts.size === 0) {
        return mergeState;
    }
    return createReadyMergeState(mergeState.files
        .map((file) => drafts.get(file.path)?.file ?? file)
        .filter((file) => file.markerBlocks.length > 0 || file.hasUnsavedDraft));
}
export function useDiffSourceLoader({
    state$,
    mergeDraftsRef,
    mergeResolveQueuesRef,
    sourceTransitionInFlightRef,
    prepareMergeDraftsForTransitionRef,
    loadRequestIdRef,
    activeProgressiveSessionRef,
    windowIdentifier,
    nativeDiffRows,
    mergeDraftsSourceKeyRef,
    loadedCacheRef,
    loadTraceRef,
    setLoadProgressValue,
    setLoadingSourceValue,
    setLoadStatisticsValue,
    setDocumentErrorValue,
    setOpenErrorValue,
    setViewerState,
    setMergeStateValue,
    preserveActiveFilePathRef,
    activeFileIndex$,
}: {
    state$: DiffViewerModel["state$"];
    mergeDraftsRef: RefObject<Map<string, DiffMergeDraftFile>>;
    mergeResolveQueuesRef: RefObject<Map<string, DiffMergeFileResolveQueue>>;
    sourceTransitionInFlightRef: RefObject<boolean>;
    prepareMergeDraftsForTransitionRef: RefObject<(reason: UnsavedDiffMergeDraftReason) => Promise<boolean>>;
    loadRequestIdRef: RefObject<number>;
    activeProgressiveSessionRef: RefObject<DiffLoadSession | null>;
    windowIdentifier: ReturnType<typeof useWindowId>;
    nativeDiffRows: boolean;
    mergeDraftsSourceKeyRef: RefObject<string | null>;
    loadedCacheRef: RefObject<Map<string, DiffLoadedCacheEntry>>;
    loadTraceRef: RefObject<DiffLoadTrace | null>;
    setLoadProgressValue: DiffViewerModel["setLoadProgressValue"];
    setLoadingSourceValue: DiffViewerModel["setLoadingSourceValue"];
    setLoadStatisticsValue: DiffViewerModel["setLoadStatisticsValue"];
    setDocumentErrorValue: DiffViewerModel["setDocumentErrorValue"];
    setOpenErrorValue: DiffViewerModel["setOpenErrorValue"];
    setViewerState: DiffViewerModel["setViewerState"];
    setMergeStateValue: DiffViewerModel["setMergeStateValue"];
    preserveActiveFilePathRef: RefObject<string | null>;
    activeFileIndex$: DiffViewerModel["activeFileIndex$"];
}) {
    "use no memo";
    const gitLoadAbortRef = useRef<AbortController | null>(null);
    useEffect(() => () => gitLoadAbortRef.current?.abort(), []);
    const loadSource = useCallback(async (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => {
        const stateBeforeTransition = state$.peek();
        const hasPendingMergeDraftWork = mergeDraftsRef.current.size > 0 || mergeResolveQueuesRef.current.size > 0;
        const shouldPrepareMergeDrafts = shouldPrepareMergeDraftsForSourceChange(stateBeforeTransition.source, nextSource, hasPendingMergeDraftWork);
        if (shouldPrepareMergeDrafts) {
            if (sourceTransitionInFlightRef.current) {
                return;
            }
            sourceTransitionInFlightRef.current = true;
            let canChangeSource = false;
            try {
                canChangeSource = await prepareMergeDraftsForTransitionRef.current("source");
            }
            finally {
                sourceTransitionInFlightRef.current = false;
            }
            if (!canChangeSource) {
                return;
            }
        }
        const requestId = loadRequestIdRef.current + 1;
        loadRequestIdRef.current = requestId;
        gitLoadAbortRef.current?.abort();
        const gitLoadController = new AbortController();
        gitLoadAbortRef.current = gitLoadController;
        activeProgressiveSessionRef.current?.cancel();
        activeProgressiveSessionRef.current = null;
        const loadStartedAt = nowMs();
        updateSavedDiffWindowSource(windowIdentifier, nextSource);
        const initialRowCount = nativeDiffRows ? 0 : diffInitialRowCount;
        const loadShowOnlyHunks = getDiffShowOnlyHunksSetting();
        const loadIgnoreWhitespaceChanges = getDiffIgnoreWhitespaceChangesSetting();
        const sourceCacheKey = getDiffSourceCacheKey(nextSource);
        const loadedCacheKey = getDiffLoadedCacheKey(nextSource, loadShowOnlyHunks, loadIgnoreWhitespaceChanges);
        const stateBeforeLoad = state$.peek();
        const isBackgroundWatchRefresh = options?.reason === "watch" &&
            stateBeforeLoad.status === "loaded" &&
            sourcesMatch(stateBeforeLoad.source, nextSource);
        if (mergeDraftsSourceKeyRef.current !== null && mergeDraftsSourceKeyRef.current !== sourceCacheKey) {
            mergeDraftsRef.current = new Map();
            mergeDraftsSourceKeyRef.current = null;
        }
        if (options?.force) {
            deleteLoadedCacheEntriesWithPrefix(loadedCacheRef.current, `${sourceCacheKey}:`, "viewer.load.force");
        }
        else if (stateBeforeLoad.status === "loaded" && !sourcesMatch(stateBeforeLoad.source, nextSource)) {
            clearLoadedCache(loadedCacheRef.current, "viewer.load.sourceChange");
        }
        const cachedEntry = !options?.force && options?.reason === "mode-toggle"
            ? loadedCacheRef.current.get(loadedCacheKey)
            : undefined;
        if (cachedEntry) {
            const trace: DiffLoadTrace = {
                cacheHit: true,
                document: cachedEntry.loaded.document,
                folderPath: nextSource.value,
                loadStartedAt,
                nativeResolvedAt: loadStartedAt,
                requestId,
                setStateAt: nowMs(),
            };
            loadTraceRef.current = trace;
            setLoadProgressValue(emptyDiffLoadProgressState);
            setLoadingSourceValue(null);
            setLoadStatisticsValue(null);
            setDocumentErrorValue(null);
            setOpenErrorValue(null);
            setViewerState({
                status: "loaded",
                folderPath: nextSource.value,
                source: nextSource,
                document: cachedEntry.loaded.document,
                files: cachedEntry.loaded.files,
                initialRows: cachedEntry.loaded.initialRows,
                loadComplete: cachedEntry.loadComplete,
                timing: cachedEntry.loaded.timing,
            });
            addRecentDiffSource(nextSource);
            return;
        }
        const trace: DiffLoadTrace = {
            cacheHit: false,
            document: null,
            folderPath: nextSource.value,
            loadStartedAt,
            nativeResolvedAt: loadStartedAt,
            requestId,
            setStateAt: loadStartedAt,
        };
        loadTraceRef.current = trace;
        const shouldStartNativeBeforeLoadingState = options?.reason === "launch" &&
            !isBackgroundWatchRefresh &&
            (nextSource.kind === "folder" || nextSource.kind === "github");
        const publishLoadingState = () => {
            setLoadProgressValue(nextSource.kind === "folder"
                ? {
                    ...emptyDiffLoadProgressState,
                    requestId,
                    source: nextSource,
                    visible: true,
                }
                : emptyDiffLoadProgressState);
            setLoadingSourceValue(nextSource);
            setLoadStatisticsValue(null);
            setMergeStateValue(nextSource.kind === "folder" ? { status: "loading" } : unavailableDiffMergeState);
            if (stateBeforeLoad.status === "loaded") {
                setDocumentErrorValue(null);
            }
            else {
                setOpenErrorValue(null);
            }
        };
        if (!isBackgroundWatchRefresh && !shouldStartNativeBeforeLoadingState) {
            publishLoadingState();
        }
        const schedulePostLoadSideEffects = (loaded: DiffLoadedPayload) => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (loadRequestIdRef.current === requestId) {
                        addRecentDiffSource(nextSource);
                        const recentDocumentPath = getDiffRecentDocumentPath(nextSource);
                        if (recentDocumentPath) {
                            noteRecentDocument(recentDocumentPath);
                        }
                        if (nextSource.kind === "folder") {
                            loadDiffMergeState(nextSource.value)
                                .then((nextMergeState) => {
                                const currentState = state$.peek();
                                if (loadRequestIdRef.current === requestId && currentState.status === "loaded" && sourcesMatch(currentState.source, nextSource)) {
                                    setMergeStateValue(applyDiffMergeDraftsToState(nextMergeState, mergeDraftsRef.current));
                                }
                            })
                                .catch((error: unknown) => {
                                if (loadRequestIdRef.current === requestId) {
                                    setMergeStateValue({
                                        status: "error",
                                        message: getErrorMessage(error),
                                    });
                                }
                            });
                        }
                    }
                }, 0);
            });
        };
        const publishLoadedState = (loaded: DiffLoadedPayload, loadComplete: boolean, reason: string) => {
            const statePayloadStartedAt = nowMs();
            const nextLoadedState: DiffViewerState = {
                status: "loaded",
                folderPath: nextSource.value,
                source: nextSource,
                document: loaded.document,
                files: loaded.files,
                initialRows: loaded.initialRows,
                loadComplete,
                timing: loaded.timing,
            };
            const statePayloadFinishedAt = nowMs();
            if (!trace.document) {
                trace.document = loaded.document;
                trace.setStateAt = statePayloadFinishedAt;
            }
            if (isBackgroundWatchRefresh) {
                const currentLoadedState = state$.peek();
                preserveActiveFilePathRef.current = currentLoadedState.status === "loaded"
                    ? getActiveDiffFile(currentLoadedState.files, activeFileIndex$.peek())?.path ?? null
                    : null;
            }
            setViewerState(nextLoadedState);
            if (isBackgroundWatchRefresh) {
                setDocumentErrorValue(null);
            }
            if (loadComplete) {
                if (shouldCacheLoadedDiff(loaded)) {
                    disposeLoadedCacheEntry(loadedCacheRef.current.get(loadedCacheKey), "viewer.cache.replace");
                    loadedCacheRef.current.set(loadedCacheKey, {
                        loaded,
                        loadComplete,
                    });
                }
                else {
                    deleteLoadedCacheEntry(loadedCacheRef.current, loadedCacheKey, "viewer.cache.skip");
                }
                setLoadProgressValue(emptyDiffLoadProgressState);
            }
        };
        let loadError: unknown = null;
        let progressiveSession: DiffLoadSession | null = null;
        try {
            const nativeStartedAt = nowMs();
            let result: DiffLoadedPayload | null = null;
            if (nextSource.kind === "github") {
                if (loadIgnoreWhitespaceChanges) {
                    if (shouldStartNativeBeforeLoadingState) {
                        publishLoadingState();
                    }
                    result = await loadUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label, initialRowCount, true);
                }
                else {
                    progressiveSession = startUnifiedDiffFromUrl(nextSource.diffUrl, nextSource.label);
                    activeProgressiveSessionRef.current = progressiveSession;
                    if (shouldStartNativeBeforeLoadingState) {
                        publishLoadingState();
                    }
                    let progressStatus = progressiveSession.getProgress();
                    setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                    while (loadRequestIdRef.current === requestId &&
                        !shouldPublishInitialProgress(progressStatus, initialRowCount, nowMs() - nativeStartedAt)) {
                        await waitForDiffProgressPoll();
                        progressStatus = progressiveSession.getProgress();
                        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                    }
                    if (loadRequestIdRef.current !== requestId) {
                        progressiveSession.cancel();
                    }
                    else if (progressStatus.error) {
                        loadError = new Error(progressStatus.error);
                    }
                    else {
                        result = progressiveSession.consumeChanges(initialRowCount);
                    }
                }
            }
            else if (isDiffGitSource(nextSource)) {
                const text = await readDiffGitSource(nextSource, { ignoreWhitespaceChanges: loadIgnoreWhitespaceChanges, signal: gitLoadController.signal });
                result = await loadUnifiedDiff(text, nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
            }
            else if (nextSource.kind === "filePair") {
                const diffCommand = createFilePairDiffCommand(nextSource, loadIgnoreWhitespaceChanges);
                const commandResult = await runCommand(diffCommand);
                if (commandResult.timedOut) {
                    loadError = new Error("File comparison timed out. The files may be too large to compare.");
                }
                else if ((commandResult.exit.type === "exited" ? commandResult.exit.code : -1) !== 0 && (commandResult.exit.type === "exited" ? commandResult.exit.code : -1) !== 1) {
                    loadError = new Error(decodeProcessText(commandResult.stderr) || `diff exited with code ${(commandResult.exit.type === "exited" ? commandResult.exit.code : -1)}.`);
                }
                else {
                    result = await loadUnifiedDiff(createFilePairUnifiedDiff(nextSource, commandResult), nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
                }
            }
            else if (nextSource.kind === "diffFile") {
                result = await loadUnifiedDiffFile(nextSource.value, nextSource.label, initialRowCount, loadIgnoreWhitespaceChanges);
            }
            else {
                progressiveSession = startGitFolderDiff(nextSource.value, {
                    ...getDiffGitFolderLoadCompareOptions(nextSource),
                    ignoreWhitespaceChanges: loadIgnoreWhitespaceChanges,
                    showOnlyHunks: loadShowOnlyHunks,
                });
                activeProgressiveSessionRef.current = progressiveSession;
                if (shouldStartNativeBeforeLoadingState) {
                    publishLoadingState();
                }
                let progressStatus = progressiveSession.getProgress();
                setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                while (loadRequestIdRef.current === requestId &&
                    !shouldPublishInitialProgress(progressStatus, initialRowCount, nowMs() - nativeStartedAt)) {
                    await waitForDiffProgressPoll();
                    progressStatus = progressiveSession.getProgress();
                    setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                }
                if (loadRequestIdRef.current !== requestId) {
                    progressiveSession.cancel();
                }
                else if (progressStatus.error) {
                    loadError = new Error(progressStatus.error);
                }
                else {
                    result = progressiveSession.consumeChanges(initialRowCount);
                }
            }
            if (!loadError) {
                if (result) {
                    const loadedResult = result;
                    result = null;
                    const nativeResolvedAt = nowMs();
                    trace.nativeResolvedAt = nativeResolvedAt;
                    if (loadRequestIdRef.current === requestId) {
                        const initialLoadComplete = "complete" in loadedResult ? loadedResult.complete : true;
                        if (isBackgroundWatchRefresh && progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
                            let progressStatus: DiffLoadStatus = loadedResult;
                            setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                            while (loadRequestIdRef.current === requestId && !progressStatus.complete && !progressStatus.error) {
                                await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                                progressStatus = progressiveSession.getProgress();
                                setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                            }
                            if (loadRequestIdRef.current !== requestId) {
                                progressiveSession.cancel();
                            }
                            else if (progressStatus.error) {
                                throw new Error(progressStatus.error);
                            }
                            else {
                                const completedProgress = progressiveSession.consumeChanges(0);
                                publishLoadedState(completedProgress, completedProgress.complete, "complete");
                                schedulePostLoadSideEffects(completedProgress);
                            }
                        }
                        else {
                            publishLoadedState(loadedResult, initialLoadComplete, "initial");
                            if (progressiveSession && "complete" in loadedResult && !loadedResult.complete) {
                                let lastFileVersion = loadedResult.fileVersion;
                                let lastRowVersion = loadedResult.rowVersion;
                                let progressStatus: DiffLoadStatus = loadedResult;
                                await waitForDiffProgressPoll(diffProgressivePostInitialLoadResumeMs);
                                while (loadRequestIdRef.current === requestId && !progressStatus.complete && !progressStatus.error) {
                                    await waitForDiffProgressPoll(diffProgressivePostInitialLoadPollMs);
                                    progressStatus = progressiveSession.getProgress();
                                    const hasChanges = progressStatus.rowVersion !== lastRowVersion ||
                                        progressStatus.fileVersion !== lastFileVersion ||
                                        progressStatus.complete ||
                                        !!progressStatus.error;
                                    if (hasChanges && loadRequestIdRef.current === requestId) {
                                        setLoadProgressValue(getDiffLoadProgressState(nextSource, requestId, progressStatus));
                                        lastFileVersion = progressStatus.fileVersion;
                                        lastRowVersion = progressStatus.rowVersion;
                                    }
                                }
                                if (loadRequestIdRef.current !== requestId) {
                                    progressiveSession.cancel();
                                }
                                else if (progressStatus.error) {
                                    throw new Error(progressStatus.error);
                                }
                                else {
                                    const completedProgress = progressiveSession.consumeChanges(0);
                                    publishLoadedState(completedProgress, true, "complete");
                                    schedulePostLoadSideEffects(completedProgress);
                                }
                            }
                            else {
                                schedulePostLoadSideEffects(loadedResult);
                            }
                        }
                    }
                    else {
                        progressiveSession?.cancel();
                    }
                }
            }
        }
        catch (error) {
            loadError = error;
        }
        finally {
            if (gitLoadAbortRef.current === gitLoadController) gitLoadAbortRef.current = null;
            if (loadRequestIdRef.current !== requestId) {
                progressiveSession?.cancel();
            }
            if (activeProgressiveSessionRef.current === progressiveSession) {
                activeProgressiveSessionRef.current = null;
            }
        }
        if (loadError && loadRequestIdRef.current === requestId) {
            if (!isBackgroundWatchRefresh) {
                loadTraceRef.current = null;
                setMergeStateValue(unavailableDiffMergeState);
                setLoadProgressValue(emptyDiffLoadProgressState);
                setLoadStatisticsValue(null);
                setLoadingSourceValue((current) => sourcesMatch(current, nextSource) ? null : current);
            }
            const message = getErrorMessage(loadError);
            const currentState = state$.peek();
            if (currentState.status === "loaded") {
                const nextError = sourcesMatch(currentState.source, nextSource)
                    ? createRefreshError(nextSource, message)
                    : createOpenError(nextSource, message);
                setDocumentErrorValue(nextError);
            }
            else {
                setOpenErrorValue(createOpenError(nextSource, message));
                setViewerState(emptyDiffViewerState);
            }
        }
    }, [
        nativeDiffRows,
        setDocumentErrorValue,
        setLoadProgressValue,
        setLoadStatisticsValue,
        setLoadingSourceValue,
        setMergeStateValue,
        setOpenErrorValue,
        setViewerState,
        state$,
        windowIdentifier,
    ]);
    return loadSource;
}
