import { focusToolbarSearch } from "@legendapp/spark/windows/macos";
import { getLegendDisplayTheme } from "@legend-apps/theme";

import { type MacOSStartupSplitViewOptions, type NavigatorWindowOptions, type WindowUpdateOptions, closeWindow, hideWindow, setWindowOptions, showWindow, } from "@legendapp/spark/windows";
import { diffPrimaryWindowIdentifier } from "./appConstants";
import { getDiffCompareToolbarModel, type DiffCompareRepoState } from "./diffCompareTargets";
import { getDiffRepresentedUrl, type DiffOpenSource } from "./diffFiles";
import { getDiffPalette } from "./diffPalette";
import { defaultDiffSidebarWidth, getDiffSidebarWidthSetting, diffViewModeOptions, getDiffSyntaxTheme, getDiffViewModeSetting, type DiffViewMode, } from "./diffSettings";
import { getDiffViewerWindowTitleVisibility } from "./diffWindowChrome";
export const diffViewModeToolbarItemId = "diff-view-mode";
export const diffSidebarToolbarItemId = "diff-toggle-sidebar";
export const diffCompareToolbarItemId = "diff-compare-target";
export const diffSearchToolbarItemId = "diff-global-search";
const diffViewModeToolbarIconByValue: Record<DiffViewMode, string> = {
    blocks: "rectangle.split.2x1",
    unified: "rectangle.portrait",
};
function createDiffSidebarToolbarItem(sidebarCollapsed?: boolean) {
    return {
        bordered: true,
        id: diffSidebarToolbarItemId,
        label: sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
        placement: "leading" as const,
        symbol: "sidebar.left",
        tooltip: sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
        type: "button" as const,
    };
}
function createDiffViewModeToolbarItem(selectedValue: DiffViewMode = getDiffViewModeSetting()) {
    return {
        id: diffViewModeToolbarItemId,
        label: "View Mode",
        value: selectedValue,
        segments: diffViewModeOptions.map((option) => ({
            label: option.label,
            symbol: diffViewModeToolbarIconByValue[option.value],
            value: option.value,
        })),
        type: "segmented" as const,
    };
}
function createDiffCompareToolbarItem(source: DiffOpenSource | null | undefined, repoState: DiffCompareRepoState | null) {
    const compareModel = getDiffCompareToolbarModel(source, repoState);
    return compareModel ? {
        bordered: true,
        id: diffCompareToolbarItemId,
        label: compareModel.label,
        items: compareModel.menuItems.map((item, index) => item.separator ? { type: "separator" as const } : { type: "checkbox" as const, id: item.value ?? `compare-disabled-${index}`, label: item.label ?? "", checked: !!item.selected, disabled: item.enabled === false, ...(item.systemImageName ? { icon: { type: "symbol" as const, name: item.systemImageName } } : {}) }),
        symbol: "arrow.triangle.branch",
        tooltip: compareModel.tooltip,
        type: "menu" as const,
    } : null;
}
function createDiffSearchToolbarItem() {
    return {
        collapses: true,
        id: diffSearchToolbarItemId,
        label: "Search",
        placeholder: "Search diff or @files",
        placement: "trailing" as const,
        type: "search" as const,
        width: 220,
    };
}
function createDiffViewerToolbarItems({ showSidebarControl, showViewModeToolbar, compareRepoState, sidebarCollapsed, source, viewMode, }: {
    showSidebarControl?: boolean;
    showViewModeToolbar?: boolean;
    compareRepoState?: DiffCompareRepoState | null;
    sidebarCollapsed?: boolean;
    source?: DiffOpenSource | null;
    viewMode?: DiffViewMode;
}) {
    const compareToolbarItem = showViewModeToolbar ? createDiffCompareToolbarItem(source, compareRepoState ?? null) : null;
    return [
        ...(showSidebarControl ? [createDiffSidebarToolbarItem(sidebarCollapsed)] : []),
        ...(showViewModeToolbar ? [createDiffSearchToolbarItem()] : []),
        ...(compareToolbarItem ? [compareToolbarItem] : []),
        ...(showViewModeToolbar ? [createDiffViewModeToolbarItem(viewMode)] : []),
    ];
}
export const diffContentMinWidth = 420;
export function createDiffStartupSplitView(options: Pick<MacOSStartupSplitViewOptions, "appearance" | "backgroundColor" | "sidebarBackgroundColor" | "sidebarWidth">): MacOSStartupSplitViewOptions {
    return {
        ...options,
        sidebarMinWidth: defaultDiffSidebarWidth,
        contentMinWidth: diffContentMinWidth,
        contentTitlebarHeight: 52,
    };
}
export function setDiffViewerStartupSplitView(windowIdentifier: string, startupSplitView: MacOSStartupSplitViewOptions | null) {
    return setWindowOptions(windowIdentifier, { macos: { startupSplitView } });
}
export function createDiffViewerWindowStyle({ appearance, includeFrame, includeToolbarItems = true, showSidebarControl, showViewModeToolbar, compareRepoState, sidebarCollapsed, source, viewMode, }: {
    appearance?: "dark" | "light";
    includeFrame: boolean;
    includeToolbarItems?: boolean;
    showSidebarControl?: boolean;
    showViewModeToolbar?: boolean;
    compareRepoState?: DiffCompareRepoState | null;
    sidebarCollapsed?: boolean;
    source?: DiffOpenSource | null;
    viewMode?: DiffViewMode;
}) {
    const syntaxTheme = getDiffSyntaxTheme();
    const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
    const diffPalette = getDiffPalette(syntaxTheme, displayTheme.colors);
    return {
        appearance: appearance ?? syntaxTheme.appearance,
        backgroundColor: diffPalette.background,
        minimizable: true,
        ...(includeFrame ? { size: { width: 1180, height: 780 }, minSize: { width: 640, height: 460 } } : {}),
        macos: {
            titleBar: { contentLayout: "fullSize", transparent: true, separator: "shadow", titleVisibility: getDiffViewerWindowTitleVisibility(showViewModeToolbar), controls: [] },
            toolbar: { visible: true, style: "unified", ...(includeToolbarItems ? { items: createDiffViewerToolbarItems({ showSidebarControl, showViewModeToolbar, compareRepoState, sidebarCollapsed, source, viewMode }) } : {}) },
            ...(includeFrame ? { startupSplitView: source ? createDiffStartupSplitView({ appearance: syntaxTheme.appearance, backgroundColor: diffPalette.background, sidebarBackgroundColor: diffPalette.sidebarBackground, sidebarWidth: getDiffSidebarWidthSetting() }) : null } : {}),
        },
    } satisfies NavigatorWindowOptions;
}

export function showDiffViewerWindow(windowIdentifier: string) {
    return windowIdentifier === diffPrimaryWindowIdentifier
        ? showWindow("main")
        : showWindow(windowIdentifier);
}
export function closeDiffViewerWindow(windowIdentifier: string) {
    return windowIdentifier === diffPrimaryWindowIdentifier
        ? hideWindow("main")
        : closeWindow(windowIdentifier);
}
export function setDiffViewerWindowAppearance({ appearance, windowIdentifier, }: {
    appearance: "dark" | "light";
    windowIdentifier: string;
}) {
    const setOptions = windowIdentifier === diffPrimaryWindowIdentifier
        ? (options: WindowUpdateOptions) => setWindowOptions("main", options)
        : (options: Parameters<typeof setWindowOptions>[1]) => setWindowOptions(windowIdentifier, options);
    return setOptions({
        ...{
            appearance
        }
    });
}
export function setDiffViewerWindowToolbarOptions({ source, compareRepoState, hasUnsavedMergeDrafts, showSidebarControl, showViewModeToolbar, sidebarCollapsed, title, viewMode, windowIdentifier, }: {
    source: DiffOpenSource | null;
    compareRepoState: DiffCompareRepoState | null;
    hasUnsavedMergeDrafts: boolean;
    showSidebarControl: boolean;
    showViewModeToolbar: boolean;
    sidebarCollapsed: boolean;
    title: string;
    viewMode: DiffViewMode;
    windowIdentifier: string;
}) {
    const setOptions = windowIdentifier === diffPrimaryWindowIdentifier
        ? (options: WindowUpdateOptions) => setWindowOptions("main", options)
        : (options: Parameters<typeof setWindowOptions>[1]) => setWindowOptions(windowIdentifier, options);
    return setOptions({
        title,
        ...createDiffViewerWindowStyle({
            includeFrame: false,
            showSidebarControl,
            showViewModeToolbar,
            compareRepoState,
            sidebarCollapsed,
            source,
            viewMode,
        }),
        macos: {
            ...createDiffViewerWindowStyle({ includeFrame: false, showSidebarControl, showViewModeToolbar, compareRepoState, sidebarCollapsed, source, viewMode }).macos,
            representedUri: getDiffRepresentedUrl(source)
        }
    });
}
export function focusDiffSearchToolbarItem(windowIdentifier: string, value = "") {
    return focusToolbarSearch(windowIdentifier, diffSearchToolbarItemId, { value });
}
