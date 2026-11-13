import { type Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { useMemo } from "react";
import { getDiffPalette } from "../diffPalette";
import type { DiffFontFamilySetting } from "../diffSettings";
import { useDiffSyntaxTheme } from "../diffSettings";
import { type DiffRowRenderState, diffSideBySideLineNumberWidth, diffSideBySideMarkerWidth, diffUnifiedChangeBarWidth, diffUnifiedLineNumberWidth, diffUnifiedMarkerWidth, getDiffRowPalette, getSideBySideDividerColor } from "../viewer/DiffRows";
import type { DiffSideBySideDataSource } from "../viewer/diffSideBySideDataSource";
import type { DiffViewerModel } from "../viewer/diffViewerModel";
import { createDiffRowRenderState, diffActiveSearchHighlightColor, diffActiveSearchRowHighlightColor, diffSearchHighlightColor, hashDiffNativeRowConfigVersion } from "./diffWindowRendering";
import { type DiffNativeRowConfigProps, type DiffRowConfig } from "./diffWindowTypes";

export function useDiffRowPresentation({
    syntaxTheme,
    diffPalette,
    collapsedFileIndexes,
    fileHeaderBackgroundColor,
    fontFamily,
    fontSize,
    foregroundColor,
    mutedColor,
    showOnlyHunks,
    syntaxHighlightingEnabled,
    loadedDocumentId,
    highlightChangedCharacters,
    rowHeight,
    showWhitespaceCharacters,
    sideBySideDataSource,
    state$,
    collapsedFileIndexes$,
}: {
    syntaxTheme: ReturnType<typeof useDiffSyntaxTheme>;
    diffPalette: ReturnType<typeof getDiffPalette>;
    collapsedFileIndexes: Set<number>;
    fileHeaderBackgroundColor: string;
    fontFamily: DiffFontFamilySetting;
    fontSize: number;
    foregroundColor: string;
    mutedColor: string;
    showOnlyHunks: boolean;
    syntaxHighlightingEnabled: boolean;
    loadedDocumentId: number;
    highlightChangedCharacters: boolean;
    rowHeight: number;
    showWhitespaceCharacters: boolean;
    sideBySideDataSource: DiffSideBySideDataSource | null;
    state$: DiffViewerModel["state$"];
    collapsedFileIndexes$: DiffViewerModel["collapsedFileIndexes$"];
}) {
    "use no memo";
    const listSyntaxTheme = syntaxTheme.name;
    const rowConfig = useMemo<DiffRowConfig>(() => ({
        borderColor: diffPalette.border,
        collapsedFileIndexes,
        fileHeaderBackgroundColor,
        fontFamily,
        fontSize,
        foregroundColor,
        mutedColor,
        showOnlyHunks,
        syntaxHighlightingEnabled,
        syntaxTheme: listSyntaxTheme,
    }), [
        collapsedFileIndexes,
        diffPalette.border,
        fileHeaderBackgroundColor,
        fontFamily,
        fontSize,
        foregroundColor,
        listSyntaxTheme,
        mutedColor,
        showOnlyHunks,
        syntaxHighlightingEnabled,
    ]);
    const nativeUnifiedRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
        const palette = getDiffRowPalette(syntaxTheme.appearance);
        const configId = `diff:${loadedDocumentId}:unified`;
        const configVersion = hashDiffNativeRowConfigVersion([
            configId,
            diffUnifiedChangeBarWidth,
            diffUnifiedLineNumberWidth,
            diffUnifiedMarkerWidth,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            mutedColor,
            palette.addAccent,
            palette.addBackground,
            palette.removeAccent,
            palette.removeBackground,
            rowHeight,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            listSyntaxTheme,
        ]);
        return {
            addAccentColor: palette.addAccent,
            addBackgroundColor: palette.addBackground,
            activeSearchHighlightColor: diffActiveSearchHighlightColor,
            activeSearchRowHighlightColor: diffActiveSearchRowHighlightColor,
            changeBarWidth: diffUnifiedChangeBarWidth,
            collapsedFileIndexes: "",
            configId,
            configVersion,
            dividerColor: "transparent",
            documentId: loadedDocumentId,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            lineNumberWidth: diffUnifiedLineNumberWidth,
            markerWidth: diffUnifiedMarkerWidth,
            mutedColor,
            presentation: "unified",
            projectionId: 0,
            removeAccentColor: palette.removeAccent,
            removeBackgroundColor: palette.removeBackground,
            rowHeight,
            searchHighlightColor: diffSearchHighlightColor,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            themeName: listSyntaxTheme,
        };
    }, [
        fontFamily,
        fontSize,
        foregroundColor,
        highlightChangedCharacters,
        listSyntaxTheme,
        loadedDocumentId,
        mutedColor,
        rowHeight,
        showWhitespaceCharacters,
        syntaxHighlightingEnabled,
        syntaxTheme.appearance,
    ]);
    const nativeSideBySideRowConfig = useMemo<DiffNativeRowConfigProps>(() => {
        const palette = getDiffRowPalette(syntaxTheme.appearance);
        const dividerColor = getSideBySideDividerColor(syntaxTheme.appearance);
        const configId = `diff:${loadedDocumentId}:blocks`;
        const projectionId = sideBySideDataSource?.getProjectionId() ?? 0;
        const configVersion = hashDiffNativeRowConfigVersion([
            configId,
            projectionId,
            dividerColor,
            diffSideBySideLineNumberWidth,
            diffSideBySideMarkerWidth,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            mutedColor,
            palette.addAccent,
            palette.addBackground,
            palette.removeAccent,
            palette.removeBackground,
            rowHeight,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            listSyntaxTheme,
        ]);
        return {
            addAccentColor: palette.addAccent,
            addBackgroundColor: palette.addBackground,
            activeSearchHighlightColor: diffActiveSearchHighlightColor,
            activeSearchRowHighlightColor: diffActiveSearchRowHighlightColor,
            changeBarWidth: 0,
            collapsedFileIndexes: "",
            configId,
            configVersion,
            dividerColor,
            documentId: loadedDocumentId,
            fontFamily,
            fontSize,
            foregroundColor,
            highlightChangedCharacters,
            lineNumberWidth: diffSideBySideLineNumberWidth,
            markerWidth: diffSideBySideMarkerWidth,
            mutedColor,
            presentation: "blocks",
            projectionId,
            removeAccentColor: palette.removeAccent,
            removeBackgroundColor: palette.removeBackground,
            rowHeight,
            searchHighlightColor: diffSearchHighlightColor,
            showWhitespaceCharacters,
            syntaxHighlightingEnabled,
            themeName: listSyntaxTheme,
        };
    }, [
        fontFamily,
        fontSize,
        foregroundColor,
        highlightChangedCharacters,
        listSyntaxTheme,
        loadedDocumentId,
        mutedColor,
        rowHeight,
        sideBySideDataSource,
        showWhitespaceCharacters,
        syntaxHighlightingEnabled,
        syntaxTheme.appearance,
    ]);
    const rowRenderInitialState = useMemo(() => createDiffRowRenderState(state$, collapsedFileIndexes$), [collapsedFileIndexes$, state$]);
    const rowRender$ = useObservable(rowRenderInitialState) as unknown as Observable<DiffRowRenderState>;
    return { rowConfig, nativeUnifiedRowConfig, nativeSideBySideRowConfig, rowRender$ };
}
