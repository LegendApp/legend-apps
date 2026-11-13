import { StyleSheet } from "react-native";
import { diffHunkHeaderHeight } from "../viewer/DiffRows";
import { diffDocumentErrorHeight, diffSidebarFileRowHeight, diffTitlebarTopInset } from "../viewer/diffViewerConstants";

const diffLoadingAccentColor = "#72b7ff";
export const styles = StyleSheet.create({
    empty: {
        alignItems: "center",
        flex: 1,
        gap: 12,
        justifyContent: "center",
        paddingHorizontal: 40,
        paddingVertical: 36,
    },
    emptyText: {
        fontSize: 15,
        lineHeight: 23,
        maxWidth: 520,
        textAlign: "center",
    },
    emptyTitle: {
        fontSize: 36,
        fontWeight: "700",
        lineHeight: 44,
    },
    content: {
        flex: 1,
        minHeight: 0
    },
    compareRefPrompt: {
        borderRadius: 7,
        borderWidth: StyleSheet.hairlineWidth,
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        width: 360,
    },
    compareRefPromptActions: {
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
        justifyContent: "flex-end",
    },
    compareRefPromptButton: {
        alignItems: "center",
        borderRadius: 5,
        borderWidth: StyleSheet.hairlineWidth,
        justifyContent: "center",
        paddingHorizontal: 10,
        height: 26,
        minWidth: 74
    },
    compareRefPromptButtonText: {
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 16,
    },
    compareRefPromptInput: {
        borderRadius: 5,
        borderWidth: StyleSheet.hairlineWidth,
        fontSize: 13,
        height: 30,
        lineHeight: 18,
        paddingHorizontal: 9,
    },
    compareRefPromptOverlay: {
        alignItems: "center",
        bottom: 0,
        justifyContent: "flex-start",
        left: 0,
        paddingTop: diffTitlebarTopInset + 54,
        position: "absolute",
        right: 0,
        top: 0,
        zIndex: 60,
    },
    compareRefPromptTitle: {
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
    },
    loadedRoot: {
        flex: 1,
        minHeight: 0
    },
    documentError: {
        height: diffDocumentErrorHeight,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    errorPanel: {
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        maxWidth: 560,
        shadowColor: "#000000",
        shadowOffset: { height: 8, width: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        width: "100%",
    },
    errorPanelActions: {
        alignItems: "center",
        flexDirection: "row",
        gap: 8,
        justifyContent: "flex-end",
        paddingTop: 10,
    },
    errorPanelBody: {
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    errorPanelButton: {
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    errorPanelButtonText: {
        fontSize: 12,
        fontWeight: "600",
        lineHeight: 16,
    },
    errorPanelMessage: {
        fontSize: 12,
        lineHeight: 18,
    },
    errorPanelStep: {
        fontSize: 12,
        lineHeight: 17,
    },
    errorPanelSteps: {
        gap: 2,
        paddingTop: 6,
    },
    errorPanelTitle: {
        fontSize: 14,
        fontWeight: "700",
        lineHeight: 20,
    },
    diffPane: {
        flex: 1,
    },
    diffHorizontalScroller: {
        bottom: 0,
        height: 16,
        left: 0,
        position: "absolute",
        right: 0,
        zIndex: 30,
    },
    diffPaneContent: {
        flex: 1,
        minHeight: 0
    },
    diffPaneTopChrome: {
        paddingTop: diffTitlebarTopInset,
    },
    diffWorkspace: {
        flex: 1,
        flexDirection: "row",
        minHeight: 0, minWidth: 0
    },
    nativeDiffRowConfig: {
        height: 0,
        overflow: "hidden",
        width: 0,
    },
    diffTitlebarSpacer: {
        height: diffTitlebarTopInset,
    },
    downloadingBody: {
        alignItems: "center",
        flex: 1,
        gap: 8,
        justifyContent: "center",
        paddingBottom: diffTitlebarTopInset,
        paddingHorizontal: 24,
    },
    loadingDetail: {
        fontSize: 12,
        fontVariant: ["tabular-nums"],
        lineHeight: 16,
    },
    loadingTitle: {
        fontSize: 13,
        fontWeight: "600",
        lineHeight: 18,
    },
    progressiveLoadingBanner: {
        alignItems: "center",
        left: 0,
        paddingHorizontal: 20,
        position: "absolute",
        right: 0,
        top: diffTitlebarTopInset + 10,
        zIndex: 35,
    },
    progressiveLoadingSurface: {
        alignItems: "center",
        borderColor: diffLoadingAccentColor,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: "row",
        gap: 11,
        paddingHorizontal: 16,
        paddingVertical: 7,
        shadowColor: diffLoadingAccentColor,
        shadowOffset: { height: 0, width: 0 },
        shadowOpacity: 0.24,
        shadowRadius: 12,
        minHeight: 48
    },
    progressiveLoadingText: {
        gap: 1,
    },
    dropOverlay: {
        alignItems: "center",
        borderRadius: 8,
        borderWidth: 2,
        bottom: 16,
        justifyContent: "center",
        left: 16,
        position: "absolute",
        right: 16,
        top: 16,
    },
    dropOverlayText: {
        fontSize: 14,
        fontWeight: "500",
        lineHeight: 20,
    },
    dropOverlayTitle: {
        fontSize: 24,
        fontWeight: "700",
        lineHeight: 32,
        marginBottom: 4,
    },
    list: {
        flex: 1,
    },
    root: {
        flex: 1,
    },
    sidebar: {
        flex: 1,
    },
    sidebarContent: {
        paddingBottom: 8,
    },
    sidebarFile: {
        borderColor: "transparent",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderTopWidth: StyleSheet.hairlineWidth,
        height: diffSidebarFileRowHeight,
    },
    sidebarFolder: {
        height: diffSidebarFileRowHeight,
    },
    sidebarFolderCollapseButton: {
        alignItems: "center",
        height: 20,
        justifyContent: "center",
        width: 20,
    },
    sidebarEmpty: {
        alignItems: "center",
        justifyContent: "center",
    },
    sidebarEmptyText: {
        fontSize: 12,
        lineHeight: 16,
    },
    sidebarList: {
        flex: 1,
    },
    statisticsLabel: {
        fontSize: 11,
        lineHeight: 15,
    },
    searchStatusLabel: {
        fontSize: 11,
        lineHeight: 15,
    },
    searchStatusPanel: {
        alignItems: "center",
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        position: "absolute",
        right: 14,
        top: diffTitlebarTopInset + 10,
        zIndex: 40,
    },
    searchStatusValue: {
        fontSize: 11,
        fontVariant: ["tabular-nums"],
        fontWeight: "600",
        lineHeight: 15,
    },
    statisticsPanel: {
        borderRadius: 6,
        borderWidth: StyleSheet.hairlineWidth,
        bottom: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
        position: "absolute",
        right: 14,
        zIndex: 40,
        minWidth: 190
    },
    statisticsRow: {
        alignItems: "center",
        flexDirection: "row",
        gap: 16,
        justifyContent: "space-between",
    },
    statisticsRows: {
        gap: 2,
    },
    statisticsTitle: {
        fontSize: 12,
        fontWeight: "700",
        lineHeight: 16,
        marginBottom: 4,
    },
    statisticsValue: {
        fontSize: 11,
        fontVariant: ["tabular-nums"],
        fontWeight: "600",
        lineHeight: 15,
    },
    unsavedMergeBanner: {
        alignItems: "center",
        left: 0,
        paddingHorizontal: 20,
        position: "absolute",
        right: 0,
        top: diffTitlebarTopInset + 10,
        zIndex: 35,
    },
    mergeChoiceButton: {
        alignItems: "center",
        borderRadius: 5,
        borderWidth: StyleSheet.hairlineWidth,
        height: 22,
        justifyContent: "center",
        width: 54,
    },
    mergeChoiceBothIcons: {
        alignItems: "center",
        flexDirection: "row",
        gap: 2,
        justifyContent: "center",
    },
    mergeChoiceColumn: {
        alignItems: "center",
        gap: 5,
        justifyContent: "center",
        position: "absolute",
        top: -31,
        width: 82,
    },
    mergeCommonMiddle: {
        alignItems: "center",
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        justifyContent: "center",
        overflow: "visible",
        position: "relative",
        width: 82,
    },
    mergeCommonPane: {
        flex: 1,
        minWidth: 0
    },
    mergeCommonRow: {
        flexDirection: "row",
        overflow: "visible",
    },
    mergeHunkHeader: {
        alignItems: "center",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: "row",
        height: diffHunkHeaderHeight,
        paddingLeft: 10,
        paddingRight: 10,
    },
    mergeHunkHeaderTitle: {
        fontSize: 11,
        fontWeight: "400",
        lineHeight: 14,
    },
    mergeNativePane: {
        flex: 1,
    },
    mergeResolvingText: {
        fontSize: 10,
        fontWeight: "600",
        lineHeight: 12,
    },
});
