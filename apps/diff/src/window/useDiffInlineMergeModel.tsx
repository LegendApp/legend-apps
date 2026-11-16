import { type DiffFileSummary, DiffMergeNativePane, type DiffSideBySideFileHeader } from "@legend-apps/diff-parser";
import { type SyntaxStyleMap } from "@legend-apps/source-viewer";
import { type SyntaxRenderLine, type SyntaxStyle, detectGrammar, ensureTreeGrammarsForPaths, highlightTreeString } from "@legend-apps/syntax-parser";
import { type VirtualizedFixedDocumentListRenderRowProps } from "@legend-apps/virtualized-document";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { type Observable, ObservableHint, batch } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { type ReactElement, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type DiffMergeConflictBlock, type DiffMergeConflictChoice, type DiffMergeConflictFile, type DiffMergeConflictRange, type DiffMergeDisplayModel, type DiffMergeDisplayRow, type DiffMergeHunkHeaderInfo, type DiffMergeSideChangeType, type DiffMergeState, createDiffMergeHunkDisplayModel } from "../diffMerge";
import { diffMergeSaveConflictKey, getMergeConflictKey } from "../diffMergeControls";
import { getDiffViewModeSetting } from "../diffSettings";
import { getActiveDiffFile } from "../viewer/diffFilePresentation";
import { type DiffInlineMergeItemIndexAllocator, type DiffInlineMergeRow, createDiffInlineMergeItemIndexAllocator, createDiffInlineMergeList, createInlineRowsForFile, getMergeFileForDiffFile } from "../viewer/diffInlineMergeModel";
import { diffHunkHeaderHeight, diffSideBySideLineNumberWidth, getDiffRowPalette } from "../viewer/DiffRows";
import { type DiffSideBySideDataSource } from "../viewer/diffSideBySideDataSource";
import { DiffSideBySideInlineMergeDataSource } from "../viewer/diffSideBySideInlineMergeDataSource";
import { DiffUnifiedInlineMergeDataSource } from "../viewer/diffUnifiedInlineMergeDataSource";
import { createDiffMergeRenderState, emptyDiffItemIndexes, hashDiffNativeRowConfigVersion } from "./diffWindowRendering";
import { styles } from "./diffWindowStyles";
import { type DiffMergeFileRenderByPath, type DiffMergeFileRenderModel, type DiffMergeRenderState, type DiffMergeSyntaxByPath } from "./diffWindowTypes";

export function getMergeConflictFileForDiffFile(mergeState: DiffMergeState, file: DiffFileSummary | null) {
    if (mergeState.status !== "ready" || !file) {
        return null;
    }
    return mergeState.fileByPath.get(file.path) ?? (file.oldPath ? mergeState.fileByPath.get(file.oldPath) : undefined) ?? null;
}
export function getActiveMergeFile({ activeFileIndex, files, mergeState, }: {
    activeFileIndex: number | null;
    files: DiffFileSummary[];
    mergeState: DiffMergeState;
}) {
    if (mergeState.status !== "ready") {
        return null;
    }
    const activeFile = getActiveDiffFile(files, activeFileIndex);
    return getMergeConflictFileForDiffFile(mergeState, activeFile);
}
function DiffMergeActionButton({ borderColor, choice, disabled, file, label, onResolveMergeConflict, primaryColor, block, }: {
    borderColor: string;
    block: DiffMergeConflictBlock;
    choice: DiffMergeConflictChoice;
    disabled: boolean;
    file: DiffMergeConflictFile;
    label: string;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    primaryColor: string;
}) {
    const iconColor = disabled ? borderColor : primaryColor;
    return (<Pressable accessibilityLabel={label} accessibilityRole="button" disabled={disabled} onPress={() => onResolveMergeConflict(file, block, choice)} style={[
            styles.mergeChoiceButton,
            {
                borderColor: disabled ? borderColor : primaryColor,
                opacity: disabled ? 0.48 : 1,
            },
        ]}>
      {choice === "both" ? (<View style={styles.mergeChoiceBothIcons}>
          <SFSymbol color={iconColor} name="arrow.left" size={12}/>
          <SFSymbol color={iconColor} name="arrow.right" size={12}/>
        </View>) : (<SFSymbol color={iconColor} name={choice === "ours" ? "arrow.left" : "arrow.right"} size={14}/>)}
    </Pressable>);
}
function createMergeSyntaxStyleMap(styles: readonly SyntaxStyle[]): SyntaxStyleMap {
    return new Map(styles.map((style) => [style.id, style]));
}
function encodeMergeNativeTokens(line: SyntaxRenderLine | undefined, tokenStyleById: SyntaxStyleMap, foregroundColor: string) {
    return line?.tokens.map((token) => {
        const tokenStyle = tokenStyleById.get(token.styleId);
        return [
            Math.max(0, Math.floor(token.startColumn)),
            Math.max(0, Math.floor(token.length)),
            tokenStyle?.foreground || foregroundColor,
            tokenStyle?.fontStyle ?? 0,
        ].join(",");
    }).join(";") ?? "";
}
function encodeMergeInlineHighlights(ranges: readonly {
    length: number;
    startColumn: number;
}[] | undefined) {
    return ranges?.map((range) => [
        Math.max(0, Math.floor(range.startColumn)),
        Math.max(0, Math.floor(range.length)),
    ].join(",")).join(";") ?? "";
}
function getMergeSyntaxLine(lines: readonly SyntaxRenderLine[] | undefined, index: number, text: string): SyntaxRenderLine {
    return lines?.[index] ?? {
        index,
        text,
        tokens: [],
    };
}
function getMergeControlRowByBlockKey(conflictRanges: readonly DiffMergeConflictRange[], file: DiffMergeConflictFile) {
    const rowByBlockKey = new Map<string, number>();
    for (const range of conflictRanges) {
        rowByBlockKey.set(getMergeConflictKey(file, range.block), Math.floor((range.startRow + range.endRow) / 2));
    }
    return rowByBlockKey;
}
function getFullMergeDisplayModel(file: DiffMergeConflictFile | null): DiffMergeDisplayModel {
    return file
        ? {
            conflictRanges: file.conflictRanges,
            rows: file.displayRows,
        }
        : {
            conflictRanges: [],
            rows: [],
        };
}
function DiffMergeHunkHeader({ borderColor, fileHeaderBackgroundColor, fontFamily, fontSize, info, mutedColor, }: {
    borderColor: string;
    fileHeaderBackgroundColor: string;
    fontFamily: string;
    fontSize: number;
    info: DiffMergeHunkHeaderInfo;
    mutedColor: string;
}) {
    return (<View style={[styles.mergeHunkHeader, { backgroundColor: fileHeaderBackgroundColor, borderColor }]}>
      <Text selectable={false} style={[styles.mergeHunkHeaderTitle, { color: mutedColor, fontFamily, fontSize }]}>
        Conflict {info.hunkNumber}: {info.lineLabel}
      </Text>
    </View>);
}
function getMergeConflictPalette(syntaxAppearance: "dark" | "light") {
    return syntaxAppearance === "dark"
        ? {
            accent: "#ffc857",
            hunkBackground: "#6f5f2e",
            inlineBackground: "#8f5f1f",
            rowBackground: "#463f20",
        }
        : {
            accent: "#9a6400",
            hunkBackground: "#fff0c2",
            inlineBackground: "#ffffffd9",
            rowBackground: "#fff8e5",
        };
}
function getMergeSideColors(changeType: DiffMergeSideChangeType | undefined, isConflict: boolean, side: "left" | "right", mutedColor: string, syntaxAppearance: "dark" | "light") {
    const palette = getDiffRowPalette(syntaxAppearance);
    const conflictPalette = getMergeConflictPalette(syntaxAppearance);
    const isDelete = changeType === "delete" || (side === "left" && changeType === "modify");
    const isAdd = changeType === "add" || (side === "right" && changeType === "modify");
    const backgroundColor = isConflict
        ? conflictPalette.rowBackground
        : isDelete
            ? palette.removeBackground
            : isAdd
                ? palette.addBackground
                : "transparent";
    const lineNumberColor = isDelete
        ? palette.removeAccent
        : isAdd
            ? palette.addAccent
            : isConflict
                ? conflictPalette.accent
                : mutedColor;
    return {
        backgroundColor,
        lineNumberColor,
    };
}
function DiffMergeCodePane({ backgroundColor, foregroundColor, fontFamily, fontSize, horizontalConfigId, inlineHighlightColor, inlineHighlights, lineNumber, lineNumberWidth, mutedColor, nativeTokens, rowHeight, text, }: {
    backgroundColor: string;
    foregroundColor: string;
    fontFamily: string;
    fontSize: number;
    horizontalConfigId: string;
    inlineHighlightColor: string;
    inlineHighlights: string;
    lineNumber?: number;
    lineNumberWidth: number;
    mutedColor: string;
    nativeTokens: string;
    rowHeight: number;
    text: string;
}) {
    return (<DiffMergeNativePane configVersion={hashDiffNativeRowConfigVersion([
            fontFamily,
            fontSize,
            foregroundColor,
            backgroundColor,
            inlineHighlightColor,
            inlineHighlights,
            lineNumber,
            mutedColor,
            nativeTokens,
            rowHeight,
            text,
        ])} fontFamily={fontFamily} fontSize={fontSize} foregroundColor={foregroundColor} horizontalConfigId={horizontalConfigId} inlineHighlightColor={inlineHighlightColor} inlineHighlights={inlineHighlights} lineNumber={lineNumber ?? -1} lineNumberWidth={lineNumberWidth} mutedColor={mutedColor} rowHeight={rowHeight} style={[styles.mergeNativePane, { backgroundColor, height: rowHeight }]} text={text} tokens={nativeTokens}/>);
}
function DiffMergeCenterGutter({ block, borderColor, file, mutedColor, onResolveMergeConflict, primaryColor, resolvingMergeConflictKeys$, }: {
    block: DiffMergeConflictBlock | null;
    borderColor: string;
    file: DiffMergeConflictFile;
    mutedColor: string;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    primaryColor: string;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
}) {
    const conflictKey = block ? getMergeConflictKey(file, block) : null;
    const resolvingState = useValue(() => {
        const resolvingKeys = resolvingMergeConflictKeys$.get();
        return (resolvingKeys.has(diffMergeSaveConflictKey) ? 1 : 0)
            | (conflictKey && resolvingKeys.has(conflictKey) ? 2 : 0);
    });
    const controlsDisabled = resolvingState !== 0;
    const isResolving = (resolvingState & 2) !== 0;
    return (<View style={[styles.mergeCommonMiddle, { borderColor }]}>
      {block ? (<View style={styles.mergeChoiceColumn}>
          <DiffMergeActionButton block={block} borderColor={borderColor} choice="ours" disabled={controlsDisabled} file={file} label="A" onResolveMergeConflict={onResolveMergeConflict} primaryColor={primaryColor}/>
          <DiffMergeActionButton block={block} borderColor={borderColor} choice="theirs" disabled={controlsDisabled} file={file} label="B" onResolveMergeConflict={onResolveMergeConflict} primaryColor={primaryColor}/>
          <DiffMergeActionButton block={block} borderColor={borderColor} choice="both" disabled={controlsDisabled} file={file} label="Both" onResolveMergeConflict={onResolveMergeConflict} primaryColor={primaryColor}/>
          {isResolving ? (<Text numberOfLines={1} style={[styles.mergeResolvingText, { color: mutedColor }]}>
              Applying
            </Text>) : null}
        </View>) : null}
    </View>);
}
function DiffMergeLineRow({ controlBlock, file, horizontalConfigId, mergeSyntaxByPath$, mergeRender$, onResolveMergeConflict, resolvingMergeConflictKeys$, row, rowIndex, }: {
    controlBlock: DiffMergeConflictBlock | null;
    file: DiffMergeConflictFile;
    horizontalConfigId: string;
    mergeSyntaxByPath$: Observable<DiffMergeSyntaxByPath>;
    mergeRender$: Observable<DiffMergeRenderState>;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
    row: DiffMergeDisplayRow | undefined;
    rowIndex: number;
}) {
    const borderColor = useValue(() => mergeRender$.borderColor.get());
    const fileHeaderBackgroundColor = useValue(() => mergeRender$.fileHeaderBackgroundColor.get());
    const fontFamily = useValue(() => mergeRender$.fontFamily.get());
    const fontSize = useValue(() => mergeRender$.fontSize.get());
    const foregroundColor = useValue(() => mergeRender$.foregroundColor.get());
    const mutedColor = useValue(() => mergeRender$.mutedColor.get());
    const primaryColor = useValue(() => mergeRender$.primaryColor.get());
    const rowHeight = useValue(() => mergeRender$.rowHeight.get());
    const syntaxAppearance = useValue(() => mergeRender$.syntaxAppearance.get());
    const mergeSyntax = useValue(() => mergeSyntaxByPath$[file.path].get());
    const tokenStyleById = mergeSyntax?.tokenStyleById ?? new Map<number, SyntaxStyle>();
    const leftSyntaxLine = getMergeSyntaxLine(mergeSyntax?.leftLines, rowIndex, row?.leftText ?? "");
    const rightSyntaxLine = getMergeSyntaxLine(mergeSyntax?.rightLines, rowIndex, row?.rightText ?? "");
    const leftTokens = encodeMergeNativeTokens(leftSyntaxLine, tokenStyleById, foregroundColor);
    const rightTokens = encodeMergeNativeTokens(rightSyntaxLine, tokenStyleById, foregroundColor);
    const isConflictRow = row?.conflictBlock !== undefined;
    const leftColors = getMergeSideColors(row?.leftChangeType, isConflictRow, "left", mutedColor, syntaxAppearance);
    const rightColors = getMergeSideColors(row?.rightChangeType, isConflictRow, "right", mutedColor, syntaxAppearance);
    const conflictPalette = getMergeConflictPalette(syntaxAppearance);
    return (<>
      {row?.hunkHeader ? (<DiffMergeHunkHeader borderColor={borderColor} fileHeaderBackgroundColor={fileHeaderBackgroundColor} fontFamily={fontFamily} fontSize={fontSize} info={row.hunkHeader} mutedColor={mutedColor}/>) : null}
      <View style={[styles.mergeCommonRow, { height: rowHeight }]}>
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane backgroundColor={leftColors.backgroundColor} foregroundColor={foregroundColor} fontFamily={fontFamily} fontSize={fontSize} horizontalConfigId={horizontalConfigId} inlineHighlightColor={conflictPalette.inlineBackground} inlineHighlights={encodeMergeInlineHighlights(row?.leftInlineChangeRanges)} lineNumber={row?.leftLineNumber} lineNumberWidth={diffSideBySideLineNumberWidth} mutedColor={leftColors.lineNumberColor} nativeTokens={leftTokens} rowHeight={rowHeight} text={row?.leftText ?? ""}/>
        </View>
        <DiffMergeCenterGutter block={controlBlock} borderColor={borderColor} file={file} mutedColor={mutedColor} onResolveMergeConflict={onResolveMergeConflict} primaryColor={primaryColor} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}/>
        <View style={styles.mergeCommonPane}>
          <DiffMergeCodePane backgroundColor={rightColors.backgroundColor} foregroundColor={foregroundColor} fontFamily={fontFamily} fontSize={fontSize} horizontalConfigId={horizontalConfigId} inlineHighlightColor={conflictPalette.inlineBackground} inlineHighlights={encodeMergeInlineHighlights(row?.rightInlineChangeRanges)} lineNumber={row?.rightLineNumber} lineNumberWidth={diffSideBySideLineNumberWidth} mutedColor={rightColors.lineNumberColor} nativeTokens={rightTokens} rowHeight={rowHeight} text={row?.rightText ?? ""}/>
        </View>
      </View>
    </>);
}
function DiffMergePlaceholderRow({ mergeRender$, }: {
    mergeRender$: Observable<DiffMergeRenderState>;
}) {
    const rowHeight = useValue(() => mergeRender$.rowHeight.get());
    return <View style={{ height: rowHeight }}/>;
}
function DiffMergeObservableLineRow({ itemIndex, mergeFileRenderByPath$, mergeItemIndexAllocator, mergeRender$, mergeSyntaxByPath$, onResolveMergeConflict, resolvingMergeConflictKeys$, }: {
    itemIndex: number;
    mergeFileRenderByPath$: Observable<DiffMergeFileRenderByPath>;
    mergeItemIndexAllocator: DiffInlineMergeItemIndexAllocator;
    mergeRender$: Observable<DiffMergeRenderState>;
    mergeSyntaxByPath$: Observable<DiffMergeSyntaxByPath>;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
}) {
    const location = mergeItemIndexAllocator.locationByItemIndex.get(itemIndex);
    const renderFile = useValue(() => location ? mergeFileRenderByPath$[location.filePath].get() : undefined);
    let content: ReactElement;
    if (location && renderFile) {
        const { controlRowByBlockKey, file, horizontalConfigId, model } = renderFile;
        const displayRow = model.rows[location.rowIndex];
        const controlBlock = displayRow?.conflictBlock
            && controlRowByBlockKey.get(getMergeConflictKey(file, displayRow.conflictBlock)) === location.rowIndex
            ? displayRow.conflictBlock
            : null;
        content = (<DiffMergeLineRow controlBlock={controlBlock} file={file} horizontalConfigId={horizontalConfigId} mergeRender$={mergeRender$} mergeSyntaxByPath$={mergeSyntaxByPath$} onResolveMergeConflict={onResolveMergeConflict} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$} row={displayRow} rowIndex={location.rowIndex}/>);
    }
    else {
        content = <DiffMergePlaceholderRow mergeRender$={mergeRender$}/>;
    }
    return content;
}
export function useDiffInlineMergeModel({ collapsedFileIndexes, documentId, files, horizontalConfigId, mergeState, onResolveMergeConflict, resolvingMergeConflictKeys$, rowHeight, showOnlyHunks, sideBySideFileHeaderByListIndex, sideBySideDataSource, syntaxHighlightingEnabled, syntaxThemeName, unifiedItemIndexes, viewMode, }: {
    collapsedFileIndexes: ReadonlySet<number>;
    documentId: number;
    files: readonly DiffFileSummary[];
    horizontalConfigId: string;
    mergeState: DiffMergeState;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
    rowHeight: number;
    showOnlyHunks: boolean;
    sideBySideFileHeaderByListIndex: Map<number, DiffSideBySideFileHeader>;
    sideBySideDataSource: DiffSideBySideDataSource | null;
    syntaxHighlightingEnabled: boolean;
    syntaxThemeName: string;
    unifiedItemIndexes: Array<number | undefined>;
    viewMode: ReturnType<typeof getDiffViewModeSetting>;
}) {
    const mergeSyntaxByPath$ = useObservable<DiffMergeSyntaxByPath>({});
    const mergeRenderInitialState = useMemo(() => createDiffMergeRenderState(), []);
    const mergeRender$ = useObservable(mergeRenderInitialState) as unknown as Observable<DiffMergeRenderState>;
    const mergeDisplayModelByPath = useMemo(() => {
        const map = new Map<string, DiffMergeDisplayModel>();
        if (mergeState.status === "ready") {
            for (const file of mergeState.files) {
                const fullModel = getFullMergeDisplayModel(file);
                map.set(file.path, showOnlyHunks
                    ? createDiffMergeHunkDisplayModel(fullModel.rows, fullModel.conflictRanges)
                    : fullModel);
            }
        }
        return map;
    }, [mergeState, showOnlyHunks]);
    const dataVersion = useMemo(() => {
        if (mergeState.status !== "ready" || mergeState.files.length === 0) {
            return "merge:none";
        }
        return `${horizontalConfigId}:` + mergeState.files.map((file) => {
            const model = mergeDisplayModelByPath.get(file.path);
            return `${file.path}:${file.displayRows.length}:${file.markerBlocks.length}:${file.hasUnsavedDraft ? "draft" : "saved"}:${model?.rows.length ?? 0}`;
        }).join("|");
    }, [horizontalConfigId, mergeDisplayModelByPath, mergeState]);
    const mergeFileRenderByPath = useMemo(() => {
        const map = new Map<string, DiffMergeFileRenderModel>();
        if (mergeState.status === "ready") {
            for (const file of mergeState.files) {
                const model = mergeDisplayModelByPath.get(file.path);
                if (model) {
                    map.set(file.path, {
                        controlRowByBlockKey: getMergeControlRowByBlockKey(model.conflictRanges, file),
                        file,
                        horizontalConfigId,
                        model,
                        showOnlyHunks,
                    });
                }
            }
        }
        return map;
    }, [horizontalConfigId, mergeDisplayModelByPath, mergeState, showOnlyHunks]);
    // Allocation identity belongs to the document, including across edits and collapse changes.
    let [mergeDocumentSession, setMergeDocumentSession] = useState(() => ({
        allocator: createDiffInlineMergeItemIndexAllocator(),
        documentId,
    }));
    if (mergeDocumentSession.documentId !== documentId) {
        mergeDocumentSession = {
            allocator: createDiffInlineMergeItemIndexAllocator(),
            documentId,
        };
        setMergeDocumentSession(mergeDocumentSession);
    }
    const mergeItemIndexAllocator = mergeDocumentSession.allocator;
    const getMergeItemIndex = mergeItemIndexAllocator.getItemIndex;
    const emptyMergeFileByPath = useMemo(() => new Map<string, DiffMergeConflictFile>(), []);
    const mergeFileByPath = mergeState.status === "ready" ? mergeState.fileByPath : emptyMergeFileByPath;
    const sideBySideMergeItems = useMemo(() => {
        const itemIndexesByFileIndex = new Map<number, readonly number[]>();
        const rowByItemIndex = new Map<number, DiffInlineMergeRow>();
        if (viewMode !== "unified") {
            for (const file of files) {
                const mergeFile = getMergeFileForDiffFile(mergeFileByPath, file);
                if (mergeFile) {
                    itemIndexesByFileIndex.set(file.index, createInlineRowsForFile({
                        file: mergeFile,
                        getMergeItemIndex,
                        model: mergeDisplayModelByPath.get(mergeFile.path),
                        rowByItemIndex,
                        sourceFileIndex: file.index,
                        sourceRowIndex: file.rowStart,
                    }));
                }
            }
        }
        return { itemIndexesByFileIndex, rowByItemIndex };
    }, [files, getMergeItemIndex, mergeDisplayModelByPath, mergeFileByPath, viewMode]);
    let [sideBySideSession, setSideBySideSession] = useState(() => ({
        base: sideBySideDataSource,
        source: sideBySideDataSource
            ? new DiffSideBySideInlineMergeDataSource(sideBySideDataSource, files, sideBySideMergeItems.itemIndexesByFileIndex)
            : null,
    }));
    if (sideBySideSession.base !== sideBySideDataSource) {
        sideBySideSession = {
            base: sideBySideDataSource,
            source: sideBySideDataSource
                ? new DiffSideBySideInlineMergeDataSource(sideBySideDataSource, files, sideBySideMergeItems.itemIndexesByFileIndex)
                : null,
        };
        setSideBySideSession(sideBySideSession);
    }
    const sideBySideInlineDataSource = sideBySideSession.source;
    useEffect(() => () => {
        sideBySideInlineDataSource?.dispose();
    }, [sideBySideInlineDataSource]);
    useLayoutEffect(() => {
        sideBySideInlineDataSource?.update(files, sideBySideMergeItems.itemIndexesByFileIndex);
    }, [files, sideBySideInlineDataSource, sideBySideMergeItems.itemIndexesByFileIndex]);
    const unifiedInlineList = useMemo(() => createDiffInlineMergeList({
        collapsedFileIndexes,
        files,
        getMergeItemIndex,
        mergeDisplayModelByPath,
        mergeFileByPath,
        sideBySideFileHeaderByListIndex,
        sideBySideItemIndexes: emptyDiffItemIndexes,
        unifiedItemIndexes,
        viewMode: "unified",
    }), [
        collapsedFileIndexes,
        files,
        getMergeItemIndex,
        mergeDisplayModelByPath,
        mergeFileByPath,
        sideBySideFileHeaderByListIndex,
        unifiedItemIndexes,
    ]);
    let [unifiedSession, setUnifiedSession] = useState(() => ({
        documentId,
        source: new DiffUnifiedInlineMergeDataSource(unifiedInlineList.itemIndexes),
    }));
    if (unifiedSession.documentId !== documentId) {
        unifiedSession = {
            documentId,
            source: new DiffUnifiedInlineMergeDataSource(unifiedInlineList.itemIndexes),
        };
        setUnifiedSession(unifiedSession);
    }
    const unifiedDataSource = unifiedSession.source;
    useLayoutEffect(() => {
        unifiedDataSource.update(unifiedInlineList.itemIndexes);
    }, [unifiedDataSource, unifiedInlineList.itemIndexes]);
    const inlineList = useMemo(() => viewMode === "unified"
        ? unifiedInlineList
        : {
            itemIndexes: emptyDiffItemIndexes,
            listIndexByFileIndex: new Map<number, number>(),
            rowByItemIndex: new Map<number, DiffInlineMergeRow>(),
            sourceRowByItemIndex: new Map<number, number>(),
        }, [unifiedInlineList, viewMode]);
    const listIndexByFileIndex = useMemo(() => {
        if (!sideBySideDataSource || viewMode === "unified") {
            return inlineList.listIndexByFileIndex;
        }
        const indexes = new Map<number, number>();
        let outputOffset = 0;
        for (let fileOrdinal = 0; fileOrdinal < files.length; fileOrdinal += 1) {
            const file = files[fileOrdinal];
            const location = sideBySideDataSource.getFileLocation(file.index);
            if (location.listIndex >= 0) {
                indexes.set(file.index, location.listIndex + outputOffset);
                const mergeItems = sideBySideMergeItems.itemIndexesByFileIndex.get(file.index);
                if (!location.collapsed && mergeItems) {
                    const nextFile = files[fileOrdinal + 1];
                    const nextLocation = nextFile ? sideBySideDataSource.getFileLocation(nextFile.index) : null;
                    const baseCount = (nextLocation && nextLocation.listIndex >= 0 ? nextLocation.listIndex : sideBySideDataSource.getLength()) - location.listIndex;
                    outputOffset += 1 + mergeItems.length - baseCount;
                }
            }
        }
        return indexes;
    }, [
        files,
        inlineList.listIndexByFileIndex,
        sideBySideDataSource,
        sideBySideMergeItems.itemIndexesByFileIndex,
        viewMode,
    ]);
    const mergeFileRenderByPath$ = useObservable<DiffMergeFileRenderByPath>(() => Object.fromEntries([...mergeFileRenderByPath].map(([path, model]) => [path, ObservableHint.opaque(model)])));
    useLayoutEffect(() => {
        const previous = mergeFileRenderByPath$.peek();
        batch(() => {
            for (const path of Object.keys(previous)) {
                if (!mergeFileRenderByPath.has(path))
                    mergeFileRenderByPath$[path].delete();
            }
            for (const [path, model] of mergeFileRenderByPath) {
                const old = previous[path];
                if (!old || old.file !== model.file || old.horizontalConfigId !== model.horizontalConfigId || old.showOnlyHunks !== model.showOnlyHunks) {
                    mergeFileRenderByPath$[path].set(ObservableHint.opaque(model));
                }
            }
        });
    }, [mergeFileRenderByPath, mergeFileRenderByPath$]);
    const activeRowByItemIndex = viewMode === "unified"
        ? inlineList.rowByItemIndex
        : sideBySideMergeItems.rowByItemIndex;
    const getInlineMergeRow = useCallback((index: number) => activeRowByItemIndex.get(index), [activeRowByItemIndex]);
    const getDocumentIndex = useCallback((index: number) => {
        const mergeRow = activeRowByItemIndex.get(index);
        return mergeRow?.sourceRowIndex ?? inlineList.sourceRowByItemIndex.get(index) ?? index;
    }, [activeRowByItemIndex, inlineList.sourceRowByItemIndex]);
    const getSideBySideDocumentIndex = useCallback((_index: number, listIndex: number) => (sideBySideInlineDataSource?.getBaseRange(listIndex, 1).start ?? listIndex), [sideBySideInlineDataSource]);
    const getItemSize = useCallback((index: number, getNormalItemSize: (index: number) => number) => {
        const mergeRow = activeRowByItemIndex.get(index);
        return mergeRow
            ? rowHeight + (mergeRow.row.hunkHeader ? diffHunkHeaderHeight : 0)
            : getNormalItemSize(index);
    }, [activeRowByItemIndex, rowHeight]);
    const getItemType = useCallback((index: number, getNormalItemType: (index: number) => string) => (activeRowByItemIndex.has(index) ? "merge-line" : getNormalItemType(index)), [activeRowByItemIndex]);
    const renderMergeRow = useCallback(({ index }: VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>) => {
        return (<DiffMergeObservableLineRow itemIndex={index} mergeFileRenderByPath$={mergeFileRenderByPath$} mergeItemIndexAllocator={mergeItemIndexAllocator} mergeRender$={mergeRender$} mergeSyntaxByPath$={mergeSyntaxByPath$} onResolveMergeConflict={onResolveMergeConflict} resolvingMergeConflictKeys$={resolvingMergeConflictKeys$}/>);
    }, [
        mergeFileRenderByPath$,
        mergeItemIndexAllocator,
        mergeRender$,
        mergeSyntaxByPath$,
        onResolveMergeConflict,
        resolvingMergeConflictKeys$,
    ]);
    useEffect(() => {
        if (mergeState.status !== "ready" || !syntaxHighlightingEnabled || mergeState.files.length === 0) {
            mergeSyntaxByPath$.set({});
            return;
        }
        let cancelled = false;
        const filesToHighlight = mergeState.files.filter((file) => (mergeDisplayModelByPath.get(file.path)?.rows.length ?? 0) > 0);
        ensureTreeGrammarsForPaths(filesToHighlight.map((file) => file.path))
            .then(() => Promise.all(filesToHighlight.map(async (file) => {
            const model = mergeDisplayModelByPath.get(file.path);
            const language = detectGrammar(file.path);
            const leftSource = model?.rows.map((row) => row.leftText).join("\n") ?? "";
            const rightSource = model?.rows.map((row) => row.rightText).join("\n") ?? "";
            const [leftResult, rightResult] = await Promise.all([
                highlightTreeString(leftSource, language, syntaxThemeName),
                highlightTreeString(rightSource, language, syntaxThemeName),
            ]);
            return { file, leftResult, rightResult };
        })))
            .then((results) => {
            if (!cancelled) {
                const nextSyntaxByPath: DiffMergeSyntaxByPath = {};
                results.forEach(({ file, leftResult, rightResult }) => {
                    const styles = [...leftResult.styles, ...rightResult.styles];
                    const syntaxKey = `${dataVersion}:${file.path}:${syntaxThemeName}`;
                    nextSyntaxByPath[file.path] = {
                        configVersion: hashDiffNativeRowConfigVersion([syntaxKey, styles.length]),
                        key: syntaxKey,
                        leftLines: leftResult.lines,
                        rightLines: rightResult.lines,
                        tokenStyleById: createMergeSyntaxStyleMap(styles),
                    };
                });
                mergeSyntaxByPath$.set(nextSyntaxByPath);
            }
        }).catch((error: unknown) => {
            if (!cancelled) {
                console.error(error instanceof Error ? error.message : String(error));
                mergeSyntaxByPath$.set({});
            }
        });
        return () => {
            cancelled = true;
        };
    }, [
        dataVersion,
        mergeDisplayModelByPath,
        mergeState,
        mergeSyntaxByPath$,
        syntaxHighlightingEnabled,
        syntaxThemeName,
    ]);
    const emptyMessage = mergeState.status === "loading"
        ? "Checking merge conflicts..."
        : mergeState.status === "error"
            ? mergeState.message
            : mergeState.status === "ready"
                ? "No unresolved marker blocks in this file."
                : mergeState.reason;
    return {
        dataVersion,
        emptyMessage,
        getDocumentIndex,
        getInlineMergeRow,
        getItemSize,
        getItemType,
        getSideBySideDocumentIndex,
        sideBySideDataSource: sideBySideInlineDataSource,
        unifiedDataSource,
        listIndexByFileIndex,
        renderMergeRow,
    };
}
