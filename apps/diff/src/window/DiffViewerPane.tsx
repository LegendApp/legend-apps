import { type DiffFileSummary, type DiffRenderRow, type DiffSideBySideRenderRow, DiffHorizontalScroller, DiffNativeRowConfig } from "@legend-apps/diff-parser";
import { type VirtualizedDocumentRequestOptions, type VirtualizedFixedDocumentListRenderRowProps, VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { LegendList } from "@legendapp/list/react-native";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { type ReactElement, memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { getFilename } from "../diffFiles";
import { defaultDiffSidebarWidth } from "../diffSettings";
import { diffContentMinWidth } from "../diffWindowControls";
import { getConflictedFileStatusPresentation, getDirectoryPath, getFileStatusPresentation } from "../viewer/diffFilePresentation";
import { DiffGrammarProgress } from "../viewer/DiffGrammarProgress";
import { type DiffInlineMergeRow } from "../viewer/diffInlineMergeModel";
import { createActiveDiffSearchHighlightMap, createDiffSearchHighlightMap } from "../viewer/diffSearch";
import { diffAdaptiveRender, diffLineOverscan, diffOverscanRequestDelayMs, diffSidebarFileRowHeight, diffSidebarTopInset, diffTitlebarTopInset } from "../viewer/diffViewerConstants";
import { type DiffSplitPaneMetrics, useDiffViewerModel } from "../viewer/diffViewerModel";
import { DiffProgressiveLoadingBanner } from "./DiffWindowChrome";
import { createDiffSearchHighlightPayload, emptyDiffListIndexByFileIndex } from "./diffWindowRendering";
import { styles } from "./diffWindowStyles";
import { type DiffLoadedContentPaneProps, type DiffLoadedSidebarPaneProps, type DiffNativeRowConfigProps, type DiffSidebarEntry, type DiffSidebarFileRowProps, type DiffSidebarFolderRowProps, type DiffSplitBodyProps } from "./diffWindowTypes";
import { getActiveMergeFile, getMergeConflictFileForDiffFile, useDiffInlineMergeModel } from "./useDiffInlineMergeModel";

const diffListContentInset = {
    bottom: 0,
    left: 0,
    right: 0,
    top: diffTitlebarTopInset,
};
const diffListViewabilityConfig = { startOffset: diffTitlebarTopInset };
const diffSidebarContentInset = {
    bottom: 0,
    left: 0,
    right: 0,
    top: diffSidebarTopInset + 36,
};
function noopVirtualizedDocumentRequestRange() {
}
function useRenderLatestRef<T>(value: T) {
    const ref = useRef(value);
    useLayoutEffect(() => {
        ref.current = value;
    }, [value]);
    return ref;
}
function getDiffSidebarItemSize() {
    return diffSidebarFileRowHeight;
}
function getDiffSidebarItemType(entry: DiffSidebarEntry) {
    return entry.type;
}
function getDiffSidebarItemKey(entry: DiffSidebarEntry) {
    return entry.id;
}
function getDiffSidebarFolderTitle(file: DiffFileSummary) {
    return getDirectoryPath(file.path) || "Files";
}
function createDiffSidebarEntries(files: readonly DiffFileSummary[], collapsedFolders: ReadonlySet<string>) {
    const entries: DiffSidebarEntry[] = [];
    let currentFolder = "";
    let currentFolderCollapsed = false;
    for (const file of files) {
        const folder = getDiffSidebarFolderTitle(file);
        if (folder !== currentFolder) {
            currentFolderCollapsed = collapsedFolders.has(folder);
            entries.push({
                collapsed: currentFolderCollapsed,
                id: `folder:${folder}:${entries.length}`,
                title: folder,
                type: "folder",
            });
            currentFolder = folder;
        }
        if (!currentFolderCollapsed) {
            entries.push({
                file,
                id: `file:${file.index}:${file.path}`,
                type: "file",
            });
        }
    }
    return entries;
}
export const DiffSidebarFolderRow = memo(function DiffSidebarFolderRow({ collapsed, onToggleFolder, sidebarRender$, title, }: DiffSidebarFolderRowProps) {
    const color = useValue(() => sidebarRender$.sidebarFolderColor.get());
    const handleToggle = useCallback(() => {
        onToggleFolder(title);
    }, [onToggleFolder, title]);
    return (<View className="flex-row items-center gap-2 px-3 pb-1 pt-3" style={styles.sidebarFolder}>
      <Text className="min-w-0 flex-1 text-xs font-medium leading-4" numberOfLines={1} style={{ color }}>
        {title}
      </Text>
      <Pressable accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${title}`} accessibilityRole="button" hitSlop={6} onPress={handleToggle} style={({ pressed }) => [
            styles.sidebarFolderCollapseButton,
            { opacity: pressed ? 0.6 : 1 },
        ]}>
        <SFSymbol color={color} name={collapsed ? "chevron.right" : "chevron.down"} size={10}/>
      </Pressable>
    </View>);
});
function diffSidebarFileRowPropsEqual(previous: DiffSidebarFileRowProps, next: DiffSidebarFileRowProps) {
    return previous.activeFileIndex$ === next.activeFileIndex$
        && previous.file === next.file
        && previous.mergeState$ === next.mergeState$
        && previous.onPressFile === next.onPressFile
        && previous.sidebarRender$ === next.sidebarRender$;
}
export const DiffSidebarFileRow = memo(function DiffSidebarFileRow({ activeFileIndex$, file, mergeState$, onPressFile, sidebarRender$, }: DiffSidebarFileRowProps) {
    const isActive = useValue(() => activeFileIndex$.get() === file.index);
    const conflictBadgeBackgroundColor = useValue(() => sidebarRender$.conflictBadgeBackgroundColor.get());
    const conflictBadgeTextColor = useValue(() => sidebarRender$.conflictBadgeTextColor.get());
    const foregroundColor = useValue(() => sidebarRender$.foregroundColor.get());
    const selectedBackgroundColor = useValue(() => sidebarRender$.selectedBackgroundColor.get());
    const selectedBorderColor = useValue(() => sidebarRender$.selectedBorderColor.get());
    const mergeFile = useValue(() => getMergeConflictFileForDiffFile(mergeState$.get(), file));
    const statusPresentation = mergeFile?.markerBlocks.length
        ? getConflictedFileStatusPresentation()
        : getFileStatusPresentation(file);
    const filename = getFilename(file.path);
    const handlePress = useCallback(() => {
        onPressFile(file);
    }, [file, onPressFile]);
    return (<Pressable accessibilityLabel={`${filename}, ${statusPresentation.title}`} accessibilityRole="button" className="flex-row items-center gap-2 px-3" onPress={handlePress} style={({ pressed }) => [
            styles.sidebarFile,
            isActive
                ? {
                    backgroundColor: selectedBackgroundColor,
                    borderColor: selectedBorderColor,
                }
                : null,
            { opacity: pressed ? 0.72 : 1 },
        ]}>
      <View className="h-4 w-4 items-center justify-center rounded" style={{ backgroundColor: statusPresentation.backgroundColor }}>
        <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={11} yOffset={statusPresentation.iconYOffset}/>
      </View>
      <Text className="min-w-0 flex-1 text-sm font-normal leading-5" numberOfLines={1} style={{ color: foregroundColor }}>
        {filename}{mergeFile?.hasUnsavedDraft ? " *" : ""}
      </Text>
      {mergeFile && mergeFile.markerBlocks.length > 0 ? (<View className="h-4 min-w-4 items-center justify-center rounded-full px-1" style={{ backgroundColor: conflictBadgeBackgroundColor }}>
          <Text className="text-xs font-bold leading-3" style={{ color: conflictBadgeTextColor }}>
            {mergeFile.markerBlocks.length}
          </Text>
        </View>) : null}
    </Pressable>);
}, diffSidebarFileRowPropsEqual);
export const DiffSplitBody = memo(function DiffSplitBody({ backgroundColor, content, debugPayload, handleSplitViewResize, sidebar, sidebarBackgroundColor, splitPaneMetrics$, sidebarCollapsed, sidebarWidth, syntaxAppearance, }: DiffSplitBodyProps) {
    const splitPaneMetrics = useValue(splitPaneMetrics$);
    const titleBar = { content: { height: 52, material: "glass" as const, overlay: { color: backgroundColor, opacity: 0.8 } }, sidebar: { overlay: { color: sidebarBackgroundColor, opacity: 0.8 } } };
    return (<View style={styles.loadedRoot}>
      <SidebarSplitView titleBar={titleBar} appearance={syntaxAppearance} contentMinWidth={diffContentMinWidth} initialPaneMetrics={splitPaneMetrics ?? undefined} onResize={handleSplitViewResize} sidebarCollapsed={sidebarCollapsed} sidebarMinWidth={defaultDiffSidebarWidth} sidebarWidth={sidebarWidth} style={styles.content} sidebar={sidebar} content={<View style={styles.diffWorkspace}>{content}</View>} />
    </View>);
});
export const DiffLoadedContentPane = memo(function DiffLoadedContentPane({ activeFileIndex$, activeItemCount, diffPaneHeight$, diffTopChromeHeight, diffRows, documentErrorBody, floatingDocumentBanner, getItemSize, getItemType, getRow, getSideBySideItemSize, getSideBySideItemType, getSideBySideRow, handleDiffPaneLayout, handleSideBySideTopItemChanged, handleSideBySideVisibleRowsRequested, handleTopItemChanged, handleVisibleRowsRequested, rowConfig, listRef, mergeState, mergeState$, nativeSideBySideRowConfig, nativeUnifiedRowConfig, noChangesBody, onInlineListIndexesChanged, renderRow, renderSideBySideRow, requestSideBySideRange, resolvingMergeConflictKeys$, onResolveMergeConflict, rowHeight, sideBySideFileHeaderByListIndex, sideBySideDataSource, splitPaneMetrics$, state, adaptiveLightModeEnabled, syntaxTokenizationState$, viewMode, visibleItemIndexes, }: DiffLoadedContentPaneProps) {
    const diffPaneHeight = useValue(diffPaneHeight$);
    const splitPaneMetrics = useValue(splitPaneMetrics$);
    const diffContentHeight = diffPaneHeight;
    const diffListHeight = Math.max(0, diffContentHeight - diffTopChromeHeight);
    const nativeUnifiedRows = viewMode === "unified";
    const nativeSideBySideRows = viewMode !== "unified";
    const nativeRowConfig = nativeUnifiedRows ? nativeUnifiedRowConfig : nativeSideBySideRows ? nativeSideBySideRowConfig : null;
    const inlineMergeModel = useDiffInlineMergeModel({
        collapsedFileIndexes: rowConfig.collapsedFileIndexes,
        documentId: state.document.documentId,
        files: state.files,
        horizontalConfigId: nativeRowConfig?.configId ?? "",
        mergeState,
        onResolveMergeConflict,
        resolvingMergeConflictKeys$,
        rowHeight,
        showOnlyHunks: rowConfig.showOnlyHunks,
        sideBySideFileHeaderByListIndex,
        sideBySideDataSource,
        syntaxHighlightingEnabled: rowConfig.syntaxHighlightingEnabled,
        syntaxThemeName: rowConfig.syntaxTheme,
        unifiedItemIndexes: visibleItemIndexes,
        viewMode,
    });
    const inlineMergeModelRef = useRenderLatestRef(inlineMergeModel);
    useLayoutEffect(() => {
        onInlineListIndexesChanged(inlineMergeModel.listIndexByFileIndex);
        return () => {
            onInlineListIndexesChanged(emptyDiffListIndexByFileIndex);
        };
    }, [inlineMergeModel.listIndexByFileIndex, onInlineListIndexesChanged]);
    const nativeRowsRef = useRenderLatestRef({ nativeSideBySideRows, nativeUnifiedRows });
    const getItemSizeRef = useRenderLatestRef(getItemSize);
    const getItemTypeRef = useRenderLatestRef(getItemType);
    const getRowRef = useRenderLatestRef(getRow);
    const getSideBySideItemSizeRef = useRenderLatestRef(getSideBySideItemSize);
    const getSideBySideItemTypeRef = useRenderLatestRef(getSideBySideItemType);
    const getSideBySideRowRef = useRenderLatestRef(getSideBySideRow);
    const handleTopItemChangedRef = useRenderLatestRef(handleTopItemChanged);
    const handleSideBySideTopItemChangedRef = useRenderLatestRef(handleSideBySideTopItemChanged);
    const renderRowRef = useRenderLatestRef(renderRow);
    const renderSideBySideRowRef = useRenderLatestRef(renderSideBySideRow);
    const diffRowsRequestRangeRef = useRenderLatestRef(diffRows.requestRange);
    const requestSideBySideRangeRef = useRenderLatestRef(requestSideBySideRange);
    const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
    const sidebarListHeight = isSidebarLayoutReady ? Math.max(0, splitPaneMetrics.sidebarHeight - diffSidebarTopInset) : 0;
    const adaptiveRender = adaptiveLightModeEnabled ? diffAdaptiveRender : undefined;
    const shouldShowNoChanges = useValue(() => (activeItemCount === 0 &&
        !getActiveMergeFile({
            activeFileIndex: activeFileIndex$.get(),
            files: state.files,
            mergeState,
        })));
    const requestUnifiedRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
        if (!nativeRowsRef.current.nativeUnifiedRows) {
            diffRowsRequestRangeRef.current(start, count, options);
        }
    }, [diffRowsRequestRangeRef, nativeRowsRef]);
    const requestBlocksRange = useCallback((start: number, count: number, options?: VirtualizedDocumentRequestOptions) => {
        if (!nativeRowsRef.current.nativeSideBySideRows) {
            requestSideBySideRangeRef.current(start, count, options);
        }
    }, [nativeRowsRef, requestSideBySideRangeRef]);
    const hasTopChrome = diffTopChromeHeight > 0;
    const contentInset = hasTopChrome ? undefined : diffListContentInset;
    const viewabilityConfig = hasTopChrome ? undefined : diffListViewabilityConfig;
    const listHeaderHeight = hasTopChrome ? 0 : diffTitlebarTopInset;
    const sideBySideLineOverscan = Math.max(12, Math.floor(diffLineOverscan / 10));
    const diffListStyle = useMemo(() => [styles.list, {
            height: diffListHeight,
            minHeight: diffListHeight
        }], [diffListHeight]);
    const getUnifiedItemSize = useCallback((index: number) => inlineMergeModelRef.current.getItemSize(index, getItemSizeRef.current), [getItemSizeRef, inlineMergeModelRef]);
    const getUnifiedItemType = useCallback((index: number) => inlineMergeModelRef.current.getItemType(index, getItemTypeRef.current), [getItemTypeRef, inlineMergeModelRef]);
    const getUnifiedRow = useCallback((index: number) => inlineMergeModelRef.current.getInlineMergeRow(index) ?? (nativeRowsRef.current.nativeUnifiedRows ? undefined : getRowRef.current(index)), [getRowRef, inlineMergeModelRef, nativeRowsRef]);
    const handleUnifiedTopItemChanged = useCallback((index: number) => {
        const mergeRow = inlineMergeModelRef.current.getInlineMergeRow(index);
        if (mergeRow) {
            activeFileIndex$.set(mergeRow.sourceFileIndex);
        }
        else {
            handleTopItemChangedRef.current(index);
        }
    }, [activeFileIndex$, handleTopItemChangedRef, inlineMergeModelRef]);
    const renderUnifiedRow = useCallback((props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow | DiffInlineMergeRow>) => (props.index < 0
        ? inlineMergeModelRef.current.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
        : renderRowRef.current(props as VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>)), [inlineMergeModelRef, renderRowRef]);
    const getSideBySideListItemSize = useCallback((index: number) => inlineMergeModelRef.current.getItemSize(index, getSideBySideItemSizeRef.current), [getSideBySideItemSizeRef, inlineMergeModelRef]);
    const getSideBySideListItemType = useCallback((index: number) => inlineMergeModelRef.current.getItemType(index, getSideBySideItemTypeRef.current), [getSideBySideItemTypeRef, inlineMergeModelRef]);
    const getSideBySideListRow = useCallback((index: number, listIndex: number) => inlineMergeModelRef.current.getInlineMergeRow(index) ?? (nativeRowsRef.current.nativeSideBySideRows ? undefined : getSideBySideRowRef.current(index, listIndex)), [getSideBySideRowRef, inlineMergeModelRef, nativeRowsRef]);
    const handleSideBySideListTopItemChanged = useCallback((index: number) => {
        const mergeRow = inlineMergeModelRef.current.getInlineMergeRow(index);
        if (mergeRow) {
            activeFileIndex$.set(mergeRow.sourceFileIndex);
        }
        else {
            handleSideBySideTopItemChangedRef.current(index);
        }
    }, [activeFileIndex$, handleSideBySideTopItemChangedRef, inlineMergeModelRef]);
    const renderSideBySideListRow = useCallback((props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow | DiffInlineMergeRow>) => (props.index < 0
        ? inlineMergeModelRef.current.renderMergeRow(props as VirtualizedFixedDocumentListRenderRowProps<DiffInlineMergeRow>)
        : renderSideBySideRowRef.current(props as VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>)), [inlineMergeModelRef, renderSideBySideRowRef]);
    let diffContent: ReactElement;
    if (diffListHeight <= 0) {
        diffContent = <View style={styles.diffPaneContent}/>;
    }
    else {
        let contentBody: ReactElement;
        if (shouldShowNoChanges) {
            contentBody = noChangesBody;
        }
        else if (viewMode === "unified") {
            contentBody = (<VirtualizedFixedDocumentList adaptiveRender={adaptiveRender} contentInset={contentInset} viewabilityConfig={viewabilityConfig} dataKey={`diff:${state.document.documentId}:unified`} dataVersion={`${diffRows.dataVersion}:${inlineMergeModel.dataVersion}`} debugName="diff-unified-list" estimatedItemSize={rowHeight} dataSource={inlineMergeModel.unifiedDataSource} itemKeyVersion={state.document.documentId} getDocumentIndex={inlineMergeModel.getDocumentIndex} getItemSize={getUnifiedItemSize} getItemType={getUnifiedItemType} listHeaderHeight={listHeaderHeight} lineOverscan={diffLineOverscan} listRef={listRef} onTopItemChanged={handleUnifiedTopItemChanged} onVisibleRowsRequested={handleVisibleRowsRequested} overscanRequestDelayMs={diffOverscanRequestDelayMs} requestRange={requestUnifiedRange} requestRangesOnScroll getRow={getUnifiedRow} rowHeight={rowHeight} renderRow={renderUnifiedRow} style={diffListStyle}/>);
        }
        else {
            contentBody = (<VirtualizedFixedDocumentList adaptiveRender={adaptiveRender} contentInset={contentInset} viewabilityConfig={viewabilityConfig} dataKey={`diff:${state.document.documentId}:${viewMode}`} dataSource={inlineMergeModel.sideBySideDataSource ?? undefined} debugName="diff-side-by-side-list" estimatedItemSize={rowHeight} itemKeyVersion={state.document.documentId} getDocumentIndex={inlineMergeModel.getSideBySideDocumentIndex} getItemSize={getSideBySideListItemSize} getItemType={getSideBySideListItemType} getRow={getSideBySideListRow} listHeaderHeight={listHeaderHeight} lineOverscan={sideBySideLineOverscan} listRef={listRef} onTopItemChanged={handleSideBySideListTopItemChanged} onVisibleRowsRequested={handleSideBySideVisibleRowsRequested} overscanRequestDelayMs={diffOverscanRequestDelayMs} requestRange={requestBlocksRange} requestRangesOnScroll rowHeight={rowHeight} renderRow={renderSideBySideListRow} style={diffListStyle}/>);
        }
        diffContent = (<View style={[
                styles.diffPaneContent,
                {
                    height: diffContentHeight,
                    minHeight: diffContentHeight
                },
            ]}>
        {hasTopChrome ? (<View style={[styles.diffPaneTopChrome, {
                    height: diffTopChromeHeight,
                    minHeight: diffTopChromeHeight
                }]}>
            {documentErrorBody}
          </View>) : null}
        {nativeRowConfig && !shouldShowNoChanges ? (<DiffNativeRowConfigView nativeRowConfig={nativeRowConfig} splitPaneMetrics$={splitPaneMetrics$} syntaxTokenizationState$={syntaxTokenizationState$}/>) : null}
        {contentBody}
        {nativeRowConfig && !shouldShowNoChanges ? (<DiffHorizontalScroller collapsable={false} configId={nativeRowConfig.configId} style={styles.diffHorizontalScroller}/>) : null}
      </View>);
    }
    return (<View onLayout={handleDiffPaneLayout} style={styles.diffPane}>
      {diffContent}
      <DiffProgressiveLoadingBanner foregroundColor={rowConfig.foregroundColor} mutedColor={rowConfig.mutedColor} source={state.source} surfaceColor={rowConfig.fileHeaderBackgroundColor}/>
      {floatingDocumentBanner}
      {rowConfig.syntaxHighlightingEnabled && <DiffGrammarProgress key={state.document.documentId} document={state.document} files={state.files}/>}
    </View>);
});
export const DiffLoadedSidebarPane = memo(function DiffLoadedSidebarPane({ backgroundColor, collapsedSidebarFolders$, handleSidebarListLayout, mutedColor, renderSidebarEntry, sidebarCollapsed, splitPaneMetrics$, state, }: DiffLoadedSidebarPaneProps) {
    const splitPaneMetrics = useValue(splitPaneMetrics$);
    const isSidebarLayoutReady = splitPaneMetrics.sidebarHeight > 0 && splitPaneMetrics.sidebarWidth > 0;
    const sidebarListHeight = isSidebarLayoutReady ? splitPaneMetrics.sidebarHeight : 0;
    const shouldRenderSidebarList = !sidebarCollapsed && isSidebarLayoutReady && sidebarListHeight > 0;
    const sidebarListStyle = useMemo(() => [styles.sidebarList, {
            height: sidebarListHeight,
            minHeight: sidebarListHeight
        }], [sidebarListHeight]);
    const collapsedSidebarFolders = useValue(collapsedSidebarFolders$);
    const sidebarEntries = useMemo(() => shouldRenderSidebarList ? createDiffSidebarEntries(state.files, collapsedSidebarFolders) : [], [collapsedSidebarFolders, shouldRenderSidebarList, state.files]);
    return (<View style={[
            styles.sidebar,
            {
                backgroundColor: Platform.OS === "macos" ? "transparent" : backgroundColor,
                height: splitPaneMetrics.sidebarHeight || undefined, width: splitPaneMetrics.sidebarWidth || undefined,
                minHeight: splitPaneMetrics.sidebarHeight || undefined
            },
        ]}>
      {shouldRenderSidebarList ? (state.files.length > 0 ? (<LegendList contentContainerStyle={styles.sidebarContent} contentInset={diffSidebarContentInset} data={sidebarEntries} estimatedItemSize={diffSidebarFileRowHeight} getFixedItemSize={getDiffSidebarItemSize} getItemType={getDiffSidebarItemType} keyExtractor={getDiffSidebarItemKey} onLayout={handleSidebarListLayout} recycleItems renderItem={renderSidebarEntry} style={sidebarListStyle}/>) : (<View style={[styles.sidebarEmpty, {
                height: sidebarListHeight,
                minHeight: sidebarListHeight
            }]}>
            <Text style={[styles.sidebarEmptyText, { color: mutedColor }]}>
              No files
            </Text>
          </View>)) : (<View style={styles.sidebarList}/>)}
    </View>);
});
export function DiffNativeRowConfigView({ nativeRowConfig, splitPaneMetrics$, syntaxTokenizationState$, searchEnabled = true, }: {
    searchEnabled?: boolean;
    nativeRowConfig: DiffNativeRowConfigProps;
    splitPaneMetrics$: Observable<DiffSplitPaneMetrics>;
    syntaxTokenizationState$: Observable<{
        ranges: string;
        version: number;
    }>;
}) {
    const { searchResults$, activeSearchResultIndex$ } = useDiffViewerModel();
    const searchHighlights = useValue(() => searchEnabled ? createDiffSearchHighlightPayload(createDiffSearchHighlightMap(searchResults$.get())) : "");
    const activeSearchHighlights = useValue(() => {
        if (!searchEnabled) return "";
        const results = searchResults$.get();
        const index = Math.min(activeSearchResultIndex$.get(), Math.max(0, results.length - 1));
        return createDiffSearchHighlightPayload(createActiveDiffSearchHighlightMap(results[index] ?? null));
    });
    const tokenizationState = useValue(() => syntaxTokenizationState$.get());
    const horizontalViewportWidth = useValue(() => splitPaneMetrics$.contentWidth.get());
    return (<DiffNativeRowConfig addAccentColor={nativeRowConfig.addAccentColor} addBackgroundColor={nativeRowConfig.addBackgroundColor} activeSearchHighlightByRowIndex={activeSearchHighlights} activeSearchHighlightColor={nativeRowConfig.activeSearchHighlightColor} activeSearchRowHighlightColor={nativeRowConfig.activeSearchRowHighlightColor} changeBarWidth={nativeRowConfig.changeBarWidth} collapsedFileIndexes={nativeRowConfig.collapsedFileIndexes} collapsable={false} configId={nativeRowConfig.configId} configVersion={nativeRowConfig.configVersion} dividerColor={nativeRowConfig.dividerColor} documentId={nativeRowConfig.documentId} fontFamily={nativeRowConfig.fontFamily} fontSize={nativeRowConfig.fontSize} foregroundColor={nativeRowConfig.foregroundColor} highlightChangedCharacters={nativeRowConfig.highlightChangedCharacters} horizontalViewportWidth={horizontalViewportWidth} lineNumberWidth={nativeRowConfig.lineNumberWidth} markerWidth={nativeRowConfig.markerWidth} mutedColor={nativeRowConfig.mutedColor} presentation={nativeRowConfig.presentation} projectionId={nativeRowConfig.projectionId} removeAccentColor={nativeRowConfig.removeAccentColor} removeBackgroundColor={nativeRowConfig.removeBackgroundColor} rowHeight={nativeRowConfig.rowHeight} searchHighlightByRowIndex={searchHighlights} searchHighlightColor={nativeRowConfig.searchHighlightColor} showWhitespaceCharacters={nativeRowConfig.showWhitespaceCharacters} style={styles.nativeDiffRowConfig} syntaxHighlightingEnabled={nativeRowConfig.syntaxHighlightingEnabled} themeName={nativeRowConfig.themeName} tokenizationVersion={tokenizationState.version} tokenizedRowRanges={tokenizationState.ranges}/>);
}
