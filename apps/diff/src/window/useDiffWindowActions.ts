import { decodeProcessText } from "@legend-apps/runtime-utils";
import { revealInFileManager } from "@legendapp/spark/files";
import { runCommand } from "@legendapp/spark/processes";
import { useWindowId } from "@legendapp/spark/windows";
import { useCallback } from "react";
import { createDiffCompareSource, createDiffCompareSourceForRef } from "../diffCompareTargets";
import { getDiffShowOnlyHunksSetting, setDiffShowOnlyHunksSetting } from "../diffSettings";
import { focusDiffSearchToolbarItem } from "../diffWindowControls";
import { getActiveDiffFile, getJoinedPath } from "../viewer/diffFilePresentation";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { createRefreshError, getErrorMessage } from "../viewer/diffViewerSupport";
import type { useDiffSourceLoader } from "./useDiffSourceLoader";

export function useDiffWindowActions({
    state$,
    loadSource,
    setDocumentErrorValue,
    loadingSource$,
    compareRepoState$,
    setCompareRefInput,
    setCompareRefPromptVisible,
    compareRefInput$,
    activeFileIndex$,
    setSidebarCollapsedValue,
    setSearchQuery,
    windowIdentifier,
    searchQuery$,
}: {
    state$: DiffViewerModel["state$"];
    loadSource: ReturnType<typeof useDiffSourceLoader>;
    setDocumentErrorValue: DiffViewerModel["setDocumentErrorValue"];
    loadingSource$: DiffViewerModel["loadingSource$"];
    compareRepoState$: DiffViewerModel["compareRepoState$"];
    setCompareRefInput: DiffViewerModel["compareRefInput$"]["set"];
    setCompareRefPromptVisible: DiffViewerModel["compareRefPromptVisible$"]["set"];
    compareRefInput$: DiffViewerModel["compareRefInput$"];
    activeFileIndex$: DiffViewerModel["activeFileIndex$"];
    setSidebarCollapsedValue: DiffViewerModel["setSidebarCollapsedValue"];
    setSearchQuery: DiffViewerModel["setSearchQuery"];
    windowIdentifier: ReturnType<typeof useWindowId>;
    searchQuery$: DiffViewerModel["searchQuery$"];
}) {
    "use no memo";
    const reloadCurrentSource = useCallback(() => {
        const currentState = state$.peek();
        if (currentState.status !== "loaded") {
            return false;
        }
        loadSource(currentState.source, { force: true, reason: "reload" }).catch((error: unknown) => {
            setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
        });
        return true;
    }, [loadSource, setDocumentErrorValue, state$]);
    const compareCurrentSource = useCallback((selection: string) => {
        const currentSource = loadingSource$.peek() ?? state$.peek().source;
        const repoPath = currentSource?.kind === "folder"
            ? currentSource.value
            : currentSource?.kind === "git"
                ? currentSource.cwd
                : null;
        const nextSource = repoPath ? createDiffCompareSource(repoPath, selection, compareRepoState$.peek()) : null;
        if (!nextSource || loadingSource$.peek()) {
            return false;
        }
        loadSource(nextSource).catch((error: unknown) => {
            setDocumentErrorValue(createRefreshError(nextSource, getErrorMessage(error)));
        });
        return true;
    }, [compareRepoState$, loadSource, loadingSource$, setDocumentErrorValue, state$]);
    const openCompareRefPrompt = useCallback(() => {
        const currentSource = loadingSource$.peek() ?? state$.peek().source;
        const repoPath = currentSource?.kind === "folder"
            ? currentSource.value
            : currentSource?.kind === "git"
                ? currentSource.cwd
                : null;
        if (!repoPath || loadingSource$.peek()) {
            return false;
        }
        setCompareRefInput("");
        setCompareRefPromptVisible(true);
        return true;
    }, [loadingSource$, state$, setCompareRefInput, setCompareRefPromptVisible]);
    const closeCompareRefPrompt = useCallback(() => {
        setCompareRefPromptVisible(false);
        setCompareRefInput("");
    }, [setCompareRefPromptVisible, setCompareRefInput]);
    const submitCompareRefPrompt = useCallback(() => {
        const ref = compareRefInput$.peek().trim();
        const currentSource = loadingSource$.peek() ?? state$.peek().source;
        const repoPath = currentSource?.kind === "folder"
            ? currentSource.value
            : currentSource?.kind === "git"
                ? currentSource.cwd
                : null;
        if (ref && repoPath && !loadingSource$.peek()) {
            const nextSource = createDiffCompareSourceForRef(repoPath, ref);
            closeCompareRefPrompt();
            loadSource(nextSource).catch((error: unknown) => {
                setDocumentErrorValue(createRefreshError(nextSource, getErrorMessage(error)));
            });
        }
    }, [closeCompareRefPrompt, compareRefInput$, loadSource, loadingSource$, setDocumentErrorValue, state$]);
    const toggleShowOnlyHunks = useCallback(() => {
        const currentState = state$.peek();
        let didToggle = false;
        if (currentState.status === "loaded" && currentState.source.kind === "folder") {
            const nextShowOnlyHunks = !getDiffShowOnlyHunksSetting();
            setDiffShowOnlyHunksSetting(nextShowOnlyHunks);
            loadSource(currentState.source, { reason: "mode-toggle" }).catch((error: unknown) => {
                setDocumentErrorValue(createRefreshError(currentState.source, getErrorMessage(error)));
            });
            didToggle = true;
        }
        return didToggle;
    }, [loadSource, setDocumentErrorValue, state$]);
    const revealCurrentFolder = useCallback(() => {
        const currentSource = state$.peek().source;
        const currentVisibleFolderPath = currentSource?.kind === "folder" ? currentSource.value : null;
        if (!currentVisibleFolderPath) {
            return false;
        }
        revealInFileManager(currentVisibleFolderPath)
            .catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
        return true;
    }, [state$]);
    const copyText = useCallback((text: string) => {
        runCommand({ target: { type: "command", name: "pbcopy" }, input: text })
            .then((result) => {
            if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
                console.error(decodeProcessText(result.stderr) || "Unable to copy to clipboard.");
            }
        })
            .catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
        return true;
    }, []);
    const copyCurrentSource = useCallback(() => {
        let didCopy = false;
        const currentVisibleSource = state$.peek().source;
        if (currentVisibleSource) {
            didCopy = copyText(currentVisibleSource.value);
        }
        return didCopy;
    }, [copyText, state$]);
    const copyCurrentFilePath = useCallback(() => {
        let didCopy = false;
        const currentState = state$.peek();
        const currentVisibleFolderPath = currentState.source?.kind === "folder" ? currentState.source.value : null;
        if (currentState.status === "loaded" && currentVisibleFolderPath) {
            const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.peek());
            if (activeFile) {
                didCopy = copyText(getJoinedPath(currentVisibleFolderPath, activeFile.path));
            }
        }
        return didCopy;
    }, [activeFileIndex$, copyText, state$]);
    const copyCurrentRelativePath = useCallback(() => {
        let didCopy = false;
        const currentState = state$.peek();
        if (currentState.status === "loaded") {
            const activeFile = getActiveDiffFile(currentState.files, activeFileIndex$.peek());
            if (activeFile) {
                didCopy = copyText(activeFile.path);
            }
        }
        return didCopy;
    }, [activeFileIndex$, copyText, state$]);
    const toggleSidebar = useCallback(() => {
        const currentState = state$.peek();
        const currentLoadingSource = loadingSource$.peek();
        const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
        const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
        if (!currentToolbarSource) {
            return false;
        }
        setSidebarCollapsedValue((current) => !current);
        return true;
    }, [loadingSource$, setSidebarCollapsedValue, state$]);
    const focusSearchWithValue = useCallback((value: string) => {
        const currentState = state$.peek();
        const currentLoadingSource = loadingSource$.peek();
        const currentLoadedFileCount = currentState.status === "loaded" ? currentState.files.length : 0;
        const currentToolbarSource = currentLoadingSource ?? (currentLoadedFileCount > 0 ? currentState.source : null);
        if (!currentToolbarSource) {
            return false;
        }
        setSearchQuery(value);
        focusDiffSearchToolbarItem(windowIdentifier, value).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
        });
        return true;
    }, [loadingSource$, state$, windowIdentifier, setSearchQuery]);
    const focusSearch = useCallback(() => {
        return focusSearchWithValue(searchQuery$.peek());
    }, [focusSearchWithValue, searchQuery$]);
    const focusFileSearch = useCallback(() => {
        return focusSearchWithValue("@");
    }, [focusSearchWithValue]);
    return { reloadCurrentSource, compareCurrentSource, openCompareRefPrompt, closeCompareRefPrompt, submitCompareRefPrompt, toggleShowOnlyHunks, revealCurrentFolder, copyCurrentSource, copyCurrentFilePath, copyCurrentRelativePath, toggleSidebar, focusSearch, focusFileSearch };
}
