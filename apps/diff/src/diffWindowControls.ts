import { getLegendDisplayTheme } from "@legend-apps/theme";
import { createUnifiedToolbarWindowStyle } from "@legend-apps/windows";
import {
  closeWindow,
  focusToolbarSearchItem,
  hideMainWindow,
  setMainWindowOptions,
  setWindowOptions,
  showMainWindow,
  showWindow,
} from "@legend-apps/window-manager";
import { diffPrimaryWindowIdentifier } from "./appConstants";
import { getDiffCompareToolbarModel, type DiffCompareRepoState } from "./diffCompareTargets";
import { getDiffRepresentedUrl, type DiffOpenSource } from "./diffFiles";
import { getDiffPalette } from "./diffPalette";
import { diffViewModeOptions, getDiffSyntaxTheme, getDiffViewModeSetting, type DiffViewMode } from "./diffSettings";
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
    systemImageName: "sidebar.left",
    tooltip: sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar",
    type: "button" as const,
  };
}

function createDiffViewModeToolbarItem(selectedValue: DiffViewMode = getDiffViewModeSetting()) {
  return {
    id: diffViewModeToolbarItemId,
    label: "View Mode",
    selectedValue,
    segments: diffViewModeOptions.map((option) => ({
      label: option.label,
      systemImageName: diffViewModeToolbarIconByValue[option.value],
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
    menuItems: compareModel.menuItems,
    systemImageName: "arrow.triangle.branch",
    tooltip: compareModel.tooltip,
    type: "menuButton" as const,
    value: compareModel.activeSelection,
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

function createDiffViewerToolbarItems({
  showSidebarControl,
  showViewModeToolbar,
  compareRepoState,
  sidebarCollapsed,
  source,
  viewMode,
}: {
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

export function createDiffViewerWindowStyle({
  appearance,
  includeFrame,
  includeToolbarItems = true,
  showSidebarControl,
  showViewModeToolbar,
  compareRepoState,
  sidebarCollapsed,
  source,
  viewMode,
}: {
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

  const windowStyle = createUnifiedToolbarWindowStyle({
    appearance: appearance ?? syntaxTheme.appearance,
    backgroundColor: diffPalette.background,
    frame: {
      width: 1180,
      height: 780,
      minWidth: 640,
      minHeight: 460,
    },
    includeFrame,
    miniaturizable: true,
  });

  return {
    ...windowStyle,
    contentLayoutMode: "fullSize" as const,
    titlebarSeparatorStyle: "shadow" as const,
    titleVisibility: getDiffViewerWindowTitleVisibility(showViewModeToolbar),
    titlebarControls: [],
    ...(includeToolbarItems
      ? {
          toolbarItems: createDiffViewerToolbarItems({
            showSidebarControl,
            showViewModeToolbar,
            compareRepoState,
            sidebarCollapsed,
            source,
            viewMode,
          }),
        }
      : {}),
  };
}

export function showDiffViewerWindow(windowIdentifier: string) {
  return windowIdentifier === diffPrimaryWindowIdentifier
    ? showMainWindow()
    : showWindow(windowIdentifier);
}

export function closeDiffViewerWindow(windowIdentifier: string) {
  return windowIdentifier === diffPrimaryWindowIdentifier
    ? hideMainWindow()
    : closeWindow(windowIdentifier);
}

export function setDiffViewerWindowAppearance({
  appearance,
  windowIdentifier,
}: {
  appearance: "dark" | "light";
  windowIdentifier: string;
}) {
  const setOptions = windowIdentifier === diffPrimaryWindowIdentifier
    ? setMainWindowOptions
    : (options: Parameters<typeof setWindowOptions>[1]) => setWindowOptions(windowIdentifier, options);
  return setOptions({
    windowStyle: {
      appearance,
    },
  });
}

export function setDiffViewerWindowToolbarOptions({
  source,
  compareRepoState,
  hasUnsavedMergeDrafts,
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  title,
  viewMode,
  windowIdentifier,
}: {
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
    ? setMainWindowOptions
    : (options: Parameters<typeof setWindowOptions>[1]) => setWindowOptions(windowIdentifier, options);
  return setOptions({
    representedURL: getDiffRepresentedUrl(source),
    title,
    windowStyle: createDiffViewerWindowStyle({
      includeFrame: false,
      showSidebarControl,
      showViewModeToolbar,
      compareRepoState,
      sidebarCollapsed,
      source,
      viewMode,
    }),
  });
}

export function focusDiffSearchToolbarItem(windowIdentifier: string, value = "") {
  return focusToolbarSearchItem(windowIdentifier, diffSearchToolbarItemId, value);
}
