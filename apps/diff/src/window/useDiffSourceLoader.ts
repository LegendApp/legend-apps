import { type DiffDocument, type DiffLoadStatus } from "@legend-apps/diff-parser";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { type DiffOpenSource, getDiffFolderCompareBaseKey } from "../diffFiles";
import { type DiffMergeState, createReadyMergeState } from "../diffMerge";
import { diffLoadedCacheMaxRows, diffProgressiveInitialPaintMaxDelayMs, diffProgressiveInitialPaintRowCount, diffProgressiveLoadPollMs } from "../viewer/diffViewerConstants";
import { type DiffLoadProgressState } from "../viewer/diffViewerModel";
import { type DiffCommandResult, type DiffLoadedCacheEntry, type DiffLoadedPayload, type DiffMergeDraftFile } from "./diffWindowTypes";

export function disposeDiffDocument(document: DiffDocument, reason: string) {
    document.cancelTokenizationRequests(reason);
    document.releaseNativeResources();
}
export function disposeLoadedCacheEntry(entry: DiffLoadedCacheEntry | undefined, reason: string) {
    if (entry) {
        disposeDiffDocument(entry.loaded.document, reason);
    }
}
export function deleteLoadedCacheEntry(cache: Map<string, DiffLoadedCacheEntry>, key: string, reason: string) {
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
export function createGitDiffCommandError(commandResult: DiffCommandResult) {
    const message = decodeProcessText(commandResult.stderr)
        ? decodeProcessText(commandResult.stderr)
        : `git diff exited with code ${(commandResult.exit.type === "exited" ? commandResult.exit.code : -1)}.`;
    return new Error(message);
}
export function waitForDiffProgressPoll(delayMs = diffProgressiveLoadPollMs) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
    });
}
export function shouldPublishInitialProgress(progress: DiffLoadStatus, initialRowCount: number, elapsedMs: number) {
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
export function getDiffLoadProgressState(source: DiffOpenSource, requestId: number, progress: DiffLoadStatus): DiffLoadProgressState {
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
    return `${source.kind}:${source.value}:${getDiffFolderCompareBaseKey(source.compareBase)}`;
}
export function getDiffLoadedCacheKey(source: DiffOpenSource, showOnlyHunks: boolean, ignoreWhitespaceChanges: boolean) {
    const mode = showOnlyHunks ? "hunks" : "full";
    const whitespace = ignoreWhitespaceChanges ? "ignore-whitespace" : "include-whitespace";
    return `${getDiffSourceCacheKey(source)}:${mode}:${whitespace}`;
}
export function getDiffGitFolderLoadCompareOptions(source: DiffOpenSource) {
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
export function shouldCacheLoadedDiff(loaded: DiffLoadedPayload) {
    return loaded.document.rowCount <= diffLoadedCacheMaxRows;
}
export function applyDiffMergeDraftsToState(mergeState: DiffMergeState, drafts: ReadonlyMap<string, DiffMergeDraftFile>): DiffMergeState {
    if (mergeState.status !== "ready" || drafts.size === 0) {
        return mergeState;
    }
    return createReadyMergeState(mergeState.files
        .map((file) => drafts.get(file.path)?.file ?? file)
        .filter((file) => file.markerBlocks.length > 0 || file.hasUnsavedDraft));
}
