import { type DiffFileSummary, type DiffLoadProgress, type DiffLoadResult, type DiffLoadTiming, type DiffRenderRow, type DiffSideBySideFileHeader, type DiffSideBySideRenderRow, type DiffSyntaxStyle } from "@legend-apps/diff-parser";
import { type SyntaxStyleMap } from "@legend-apps/source-viewer";
import { type SyntaxRenderLine } from "@legend-apps/syntax-parser";
import { type VirtualizedDocumentRequestOptions, type VirtualizedDocumentRowsState, type VirtualizedDocumentVisibleRangeInfo, type VirtualizedFixedDocumentListRef, type VirtualizedFixedDocumentListRenderRowProps } from "@legend-apps/virtualized-document";
import { type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { runCommand } from "@legendapp/spark/processes";
import { type SidebarSplitViewResizeEvent } from "@legendapp/spark/ui/split-view";
import { type Observable, type OpaqueObject } from "@legendapp/state";
import { type ReactElement, type ReactNode, type RefObject } from "react";
import { type LayoutChangeEvent } from "react-native";
import { type DiffOpenSource } from "../diffFiles";
import { type DiffMergeConflictBlock, type DiffMergeConflictChoice, type DiffMergeConflictFile, type DiffMergeDisplayModel, type DiffMergeState } from "../diffMerge";
import { getDiffViewModeSetting, type DiffSettingsFile } from "../diffSettings";
import { type DiffSideBySideDataSource } from "../viewer/diffSideBySideDataSource";
import { type DiffLoadedState, type DiffSplitPaneMetrics } from "../viewer/diffViewerModel";

export type DiffCommandResult = Awaited<ReturnType<typeof runCommand>>;
export type DiffLoadedPayload = DiffLoadResult | DiffLoadProgress;
export type DiffLoadedCacheEntry = {
    loaded: DiffLoadedPayload;
    loadComplete: boolean;
};
export type DiffItemCountLimitState = {
    documentId: number;
    limit: number;
};
export type DiffMergeDraftFile = {
    content: string;
    file: DiffMergeConflictFile;
};
export type DiffMergeFileResolveQueue = {
    chain: Promise<void>;
    completedOriginalBlockIndexes: number[];
};
export type DiffViewerWindowProps = {
    windowIdentifier?: string;
    focusUrlInputRequestId?: number;
    folderPath?: string;
    initialSplitPaneMetrics?: DiffSplitPaneMetrics | null;
    onClose?: () => void;
    source?: DiffOpenSource;
};
export type DiffSidebarFileRowProps = {
    activeFileIndex$: Observable<number | null>;
    file: DiffFileSummary;
    mergeState$: Observable<DiffMergeState>;
    onPressFile: (file: DiffFileSummary) => void;
    sidebarRender$: Observable<DiffSidebarRenderState>;
};
export type DiffSidebarFolderRowProps = {
    collapsed: boolean;
    onToggleFolder: (title: string) => void;
    sidebarRender$: Observable<DiffSidebarRenderState>;
    title: string;
};
export type DiffSidebarRenderState = {
    conflictBadgeBackgroundColor: string;
    conflictBadgeTextColor: string;
    foregroundColor: string;
    selectedBackgroundColor: string;
    selectedBorderColor: string;
    sidebarFolderColor: string;
};
export type DiffSidebarEntry = {
    id: string;
    collapsed: boolean;
    title: string;
    type: "folder";
} | {
    file: DiffFileSummary;
    id: string;
    type: "file";
};
type DiffLoadedBodyProps = {
    activeFileIndex$: Observable<number | null>;
    activeItemCount: number;
    backgroundColor: string;
    collapsedSidebarFolders$: Observable<Set<string>>;
    diffPaneHeight$: Observable<number>;
    diffTopChromeHeight: number;
    diffRows: VirtualizedDocumentRowsState<DiffRenderRow, DiffSyntaxStyle, DiffLoadTiming>;
    documentErrorBody: ReactNode;
    floatingDocumentBanner: ReactNode;
    getItemSize: (index: number) => number;
    getItemType: (index: number) => string;
    getRow: (index: number) => DiffRenderRow | undefined;
    getSideBySideItemSize: (index: number) => number;
    getSideBySideItemType: (index: number) => string;
    getSideBySideRow: (index: number, listIndex: number) => DiffSideBySideRenderRow | undefined;
    handleDiffPaneLayout: (event: LayoutChangeEvent) => void;
    handleSidebarListLayout: (event: LayoutChangeEvent) => void;
    handleSideBySideTopItemChanged: (lineIndex: number) => void;
    handleSideBySideVisibleRowsRequested: (start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => void;
    handleSplitViewResize: (event: SidebarSplitViewResizeEvent) => void;
    handleTopItemChanged: (rowIndex: number) => void;
    handleVisibleRowsRequested: (start: number, count: number, info: VirtualizedDocumentVisibleRangeInfo) => void;
    rowConfig: DiffRowConfig;
    listRef: RefObject<VirtualizedFixedDocumentListRef | null>;
    mergeState: DiffMergeState;
    mergeState$: Observable<DiffMergeState>;
    nativeSideBySideRowConfig: DiffNativeRowConfigProps;
    nativeUnifiedRowConfig: DiffNativeRowConfigProps;
    onInlineListIndexesChanged: (indexes: ReadonlyMap<number, number>) => void;
    adaptiveLightModeEnabled: boolean;
    mutedColor: string;
    noChangesBody: ReactElement;
    primaryColor: string;
    renderRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffRenderRow>) => ReactElement;
    renderSidebarEntry: (props: LegendListRenderItemProps<DiffSidebarEntry>) => ReactElement;
    renderSideBySideRow: (props: VirtualizedFixedDocumentListRenderRowProps<DiffSideBySideRenderRow>) => ReactElement;
    requestSideBySideRange: (lineStart: number, lineCount: number, options?: VirtualizedDocumentRequestOptions) => void;
    resolvingMergeConflictKeys$: Observable<Set<string>>;
    onResolveMergeConflict: (file: DiffMergeConflictFile, block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) => void;
    rowHeight: number;
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    sideBySideFileHeaderByListIndex: Map<number, DiffSideBySideFileHeader>;
    sideBySideDataSource: DiffSideBySideDataSource | null;
    splitPaneMetrics$: Observable<DiffSplitPaneMetrics>;
    state: DiffLoadedState;
    syntaxAppearance: "dark" | "light";
    syntaxTokenizationState$: Observable<{
        ranges: string;
        version: number;
    }>;
    viewMode: ReturnType<typeof getDiffViewModeSetting>;
    visibleItemIndexes: Array<number | undefined>;
};
type DiffLoadingSplitBodyProps = {
    backgroundColor: string;
    handleSplitViewResize: (event: SidebarSplitViewResizeEvent) => void;
    sidebarBackgroundColor: string;
    splitPaneMetrics$: Observable<DiffSplitPaneMetrics>;
    sidebarCollapsed: boolean;
    sidebarWidth: number;
    syntaxAppearance: "dark" | "light";
};
export type DiffSplitBodyProps = DiffLoadingSplitBodyProps & {
    content: ReactElement;
    debugPayload?: Record<string, unknown>;
    sidebar: ReactElement;
};
export type DiffLoadedSidebarPaneProps = Pick<DiffLoadedBodyProps, "collapsedSidebarFolders$" | "handleSidebarListLayout" | "mutedColor" | "renderSidebarEntry" | "sidebarCollapsed" | "splitPaneMetrics$" | "state"> & {
    backgroundColor: string;
};
export type DiffLoadedContentPaneProps = Omit<DiffLoadedBodyProps, "backgroundColor" | "collapsedSidebarFolders$" | "handleSidebarListLayout" | "handleSplitViewResize" | "mutedColor" | "primaryColor" | "renderSidebarEntry" | "sidebarCollapsed" | "sidebarWidth" | "syntaxAppearance">;
export type DiffRowConfig = {
    borderColor: string;
    collapsedFileIndexes: ReadonlySet<number>;
    fileHeaderBackgroundColor: string;
    fontFamily: string;
    fontSize: number;
    foregroundColor: string;
    mutedColor: string;
    showOnlyHunks: boolean;
    syntaxHighlightingEnabled: boolean;
    syntaxTheme: DiffSettingsFile["syntaxTheme"];
};
export type DiffNativeRowConfigProps = {
    addAccentColor: string;
    addBackgroundColor: string;
    activeSearchHighlightColor: string;
    activeSearchRowHighlightColor: string;
    changeBarWidth: number;
    collapsedFileIndexes: string;
    configId: string;
    configVersion: number;
    dividerColor: string;
    documentId: number;
    fontFamily: string;
    fontSize: number;
    foregroundColor: string;
    highlightChangedCharacters: boolean;
    lineNumberWidth: number;
    markerWidth: number;
    mutedColor: string;
    presentation: "blocks" | "unified";
    projectionId: number;
    removeAccentColor: string;
    removeBackgroundColor: string;
    rowHeight: number;
    searchHighlightColor: string;
    showWhitespaceCharacters: boolean;
    syntaxHighlightingEnabled: boolean;
    themeName: string;
};
export type DiffMergeRenderState = {
    borderColor: string;
    fileHeaderBackgroundColor: string;
    fontFamily: string;
    fontSize: number;
    foregroundColor: string;
    mutedColor: string;
    primaryColor: string;
    rowHeight: number;
    syntaxAppearance: "dark" | "light";
};
type DiffMergeSyntaxState = {
    configVersion: number;
    key: string;
    leftLines: readonly SyntaxRenderLine[];
    rightLines: readonly SyntaxRenderLine[];
    tokenStyleById: SyntaxStyleMap;
};
export type DiffMergeSyntaxByPath = Record<string, DiffMergeSyntaxState | undefined>;
export type DiffMergeFileRenderModel = {
    controlRowByBlockKey: ReadonlyMap<string, number>;
    file: DiffMergeConflictFile;
    horizontalConfigId: string;
    model: DiffMergeDisplayModel;
    showOnlyHunks: boolean;
};
export type DiffMergeFileRenderByPath = Record<string, OpaqueObject<DiffMergeFileRenderModel> | undefined>;
