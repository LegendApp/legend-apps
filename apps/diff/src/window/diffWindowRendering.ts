import { type DiffFileSummary, type DiffSideBySideFileHeader } from "@legend-apps/diff-parser";
import { getSyntaxTheme } from "@legend-apps/syntax-parser";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { computed, type Observable } from "@legendapp/state";
import { getDiffPalette } from "../diffPalette";
import { diffSettings$ } from "../diffSettings";
import { createCollapsedFileIndexList, createFileByRowStart, getBoundedSideBySideLayoutMetadata } from "../viewer/diffLoadedDocumentModel";
import { diffBackgroundTokenizeMaxFileCount, diffBackgroundTokenizeMaxSourceLineCount } from "../viewer/diffViewerConstants";
import { type DiffViewerState } from "../viewer/diffViewerModel";

export const diffActiveSearchHighlightColor = "#ff7a00d9";
export const diffActiveSearchRowHighlightColor = "#ff950038";
export const diffSearchHighlightColor = "#ffcc336b";
export const emptyDiffListIndexByFileIndex: ReadonlyMap<number, number> = new Map();
export const emptyDiffItemIndexes: Array<number | undefined> = [];
export function getBackgroundTokenizationPlan(files: readonly DiffFileSummary[]) {
    const selectedFiles: DiffFileSummary[] = [];
    let sourceLineCount = 0;
    let rowLimit = 0;
    for (const file of files) {
        if (selectedFiles.length >= diffBackgroundTokenizeMaxFileCount) {
            break;
        }
        const rowCount = Math.max(0, Math.ceil(file.rowCount));
        const rowStart = Math.max(0, Math.floor(file.rowStart));
        if (rowCount > 0 && sourceLineCount + rowCount <= diffBackgroundTokenizeMaxSourceLineCount) {
            selectedFiles.push(file);
            sourceLineCount += rowCount;
            rowLimit = Math.max(rowLimit, rowStart + rowCount);
        }
        else {
            break;
        }
    }
    return {
        files: selectedFiles,
        rowLimit,
        sourceLineCount,
    };
}
export function hashDiffNativeRowConfigVersion(parts: readonly unknown[]) {
    let hash = 2166136261;
    for (const part of parts) {
        const value = String(part);
        for (let index = 0; index < value.length; index += 1) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        hash ^= 31;
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function createDiffSearchHighlightPayload(highlights: ReadonlyMap<number, string>) {
    const record: Record<string, string> = {};
    highlights.forEach((value, key) => {
        record[String(key)] = value;
    });
    return JSON.stringify(record);
}
function getCurrentDiffSettingsSnapshot() {
    const fontFamily = diffSettings$.fontFamily.get();
    const fontSize = diffSettings$.fontSize.get();
    const syntaxHighlightingEnabled = diffSettings$.syntaxHighlightingEnabled.get();
    const syntaxThemeName = diffSettings$.syntaxTheme.get();
    const showOnlyHunks = diffSettings$.showOnlyHunks.get();
    const syntaxTheme = getSyntaxTheme(syntaxThemeName);
    const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
    const diffPalette = getDiffPalette(syntaxTheme, displayTheme.colors);
    const rowHeight = getDiffLineRowHeight(fontSize);
    return {
        diffPalette,
        fontFamily,
        fontSize,
        rowHeight,
        showOnlyHunks,
        syntaxHighlightingEnabled,
        syntaxTheme,
        syntaxThemeName,
    };
}
const diffRenderSettings$ = computed(getCurrentDiffSettingsSnapshot);
function getCurrentLoadedDiffState(state$: Observable<DiffViewerState>) {
    const currentState = state$.get();
    return currentState.status === "loaded" ? currentState : null;
}
function createFileByIndex(files: readonly DiffFileSummary[]) {
    const map = new Map<number, DiffFileSummary>();
    for (const file of files) {
        map.set(file.index, file);
    }
    return map;
}
function createFileHeaderRowIndexes(files: readonly DiffFileSummary[]) {
    const indexes = new Set<number>();
    for (const file of files) {
        indexes.add(Math.max(0, Math.floor(file.rowStart)));
    }
    return indexes;
}
function createSideBySideFileHeaderByListIndex(fileHeaders: readonly DiffSideBySideFileHeader[]) {
    const map = new Map<number, DiffSideBySideFileHeader>();
    for (const header of fileHeaders) {
        map.set(header.listIndex, header);
    }
    return map;
}
function getCurrentCollapsedFileIndexList(collapsedFileIndexes$: Observable<Set<number>>) {
    return createCollapsedFileIndexList(collapsedFileIndexes$.get());
}
export function createDiffRowRenderState(state$: Observable<DiffViewerState>, collapsedFileIndexes$: Observable<Set<number>>) {
    return {
        document: {
            collapsedFileIndexList: () => getCurrentCollapsedFileIndexList(collapsedFileIndexes$),
            current: () => getCurrentLoadedDiffState(state$)?.document ?? null,
            fileByIndex: () => {
                const currentState = getCurrentLoadedDiffState(state$);
                return currentState ? createFileByIndex(currentState.files) : new Map<number, DiffFileSummary>();
            },
            fileByRowStart: () => {
                const currentState = getCurrentLoadedDiffState(state$);
                return currentState ? createFileByRowStart(currentState.files) : new Map<number, DiffFileSummary>();
            },
            fileHeaderRowIndexes: () => {
                const currentState = getCurrentLoadedDiffState(state$);
                return currentState ? createFileHeaderRowIndexes(currentState.files) : new Set<number>();
            },
            sideBySideFileHeaderByListIndex: () => {
                const document = getCurrentLoadedDiffState(state$)?.document;
                const collapsedFileIndexList = getCurrentCollapsedFileIndexList(collapsedFileIndexes$);
                const rowCount = document
                    ? Math.max(0, Math.floor(document.getSideBySideRowCount(collapsedFileIndexList)))
                    : 0;
                const layoutMetadata = document
                    ? getBoundedSideBySideLayoutMetadata(document, rowCount, collapsedFileIndexList)
                    : { fileHeaders: [] };
                return createSideBySideFileHeaderByListIndex(layoutMetadata.fileHeaders);
            },
            sideBySideRowCount: () => {
                const document = getCurrentLoadedDiffState(state$)?.document;
                const collapsedFileIndexList = getCurrentCollapsedFileIndexList(collapsedFileIndexes$);
                return document
                    ? Math.max(0, Math.floor(document.getSideBySideRowCount(collapsedFileIndexList)))
                    : 0;
            },
        },
        presentation: {
            borderColor: () => diffRenderSettings$.get().diffPalette.border,
            fileHeaderBackgroundColor: () => diffRenderSettings$.get().diffPalette.fileHeaderBackground,
            fontFamily: () => diffRenderSettings$.get().fontFamily,
            fontSize: () => diffRenderSettings$.get().fontSize,
            foregroundColor: () => diffRenderSettings$.get().diffPalette.foreground,
            hunkHeaderBackgroundColor: () => diffRenderSettings$.get().diffPalette.hunkHeaderBackground,
            mutedColor: () => diffRenderSettings$.get().diffPalette.muted,
            rowHeight: () => diffRenderSettings$.get().rowHeight,
            showOnlyHunks: () => diffRenderSettings$.get().showOnlyHunks,
            syntaxAppearance: () => diffRenderSettings$.get().syntaxTheme.appearance,
            syntaxHighlightingEnabled: () => diffRenderSettings$.get().syntaxHighlightingEnabled,
            syntaxThemeName: () => diffRenderSettings$.get().syntaxThemeName,
        },
    };
}
export function createDiffSidebarRenderState() {
    return {
        conflictBadgeBackgroundColor: () => diffRenderSettings$.get().diffPalette.sidebarConflictBadgeBackground,
        conflictBadgeTextColor: () => diffRenderSettings$.get().diffPalette.sidebarConflictBadgeText,
        foregroundColor: () => diffRenderSettings$.get().diffPalette.foreground,
        selectedBackgroundColor: () => diffRenderSettings$.get().diffPalette.sidebarSelectedBackground,
        selectedBorderColor: () => diffRenderSettings$.get().diffPalette.sidebarSelectedBorder,
        sidebarFolderColor: () => diffRenderSettings$.get().diffPalette.sidebarFolder,
    };
}
export function createDiffMergeRenderState() {
    return {
        borderColor: () => diffRenderSettings$.get().diffPalette.border,
        fileHeaderBackgroundColor: () => diffRenderSettings$.get().diffPalette.fileHeaderBackground,
        fontFamily: () => diffRenderSettings$.get().fontFamily,
        fontSize: () => diffRenderSettings$.get().fontSize,
        foregroundColor: () => diffRenderSettings$.get().diffPalette.foreground,
        mutedColor: () => diffRenderSettings$.get().diffPalette.muted,
        primaryColor: () => diffRenderSettings$.get().diffPalette.primary,
        rowHeight: () => diffRenderSettings$.get().rowHeight,
        syntaxAppearance: () => diffRenderSettings$.get().syntaxTheme.appearance,
    };
}
export function getDiffLineRowHeight(fontSize: number) {
    return Math.max(20, fontSize + 9);
}
