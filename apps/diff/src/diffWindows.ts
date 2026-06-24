import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createUnifiedToolbarWindowStyle, createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions } from "@legend-desktop/window-manager";
import {
  diffSettingsWindowIdentifier,
  diffSettingsWindowModuleName,
  diffViewerWindowIdentifier,
  diffViewerWindowModuleName,
} from "./appConstants";
import { getDiffSourceLabel, normalizeDiffOpenSource, type DiffOpenSource } from "./diffFiles";
import { diffViewModeOptions, getDiffSyntaxTheme, getDiffViewModeSetting, type DiffViewMode } from "./diffSettings";
import { SettingsWindow } from "./SettingsWindow";

export const diffViewModeToolbarItemId = "diff-view-mode";
export const diffSidebarToolbarItemId = "diff-toggle-sidebar";
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

function createDiffViewerWindowStyle({
  appearance,
  includeFrame,
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  viewMode,
}: {
  appearance?: "dark" | "light";
  includeFrame: boolean;
  showSidebarControl?: boolean;
  showViewModeToolbar?: boolean;
  sidebarCollapsed?: boolean;
  viewMode?: DiffViewMode;
}) {
  const syntaxTheme = getDiffSyntaxTheme();

  const windowStyle = createUnifiedToolbarWindowStyle({
    appearance: appearance ?? syntaxTheme.appearance,
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
    titlebarControls: [],
    toolbarItems: [
      ...(showSidebarControl ? [createDiffSidebarToolbarItem(sidebarCollapsed)] : []),
      ...(showViewModeToolbar ? [createDiffViewModeToolbarItem(viewMode)] : []),
    ],
  };
}

const diffWindowsConfig = {
  [diffViewerWindowModuleName]: {
    loadComponent: () => import("./DiffViewerWindow"),
    identifier: diffViewerWindowIdentifier,
    options: {
      title: "Legend Diff",
      transparentBackground: true,
      windowStyle: createDiffViewerWindowStyle({ includeFrame: true }),
    },
  },
  [diffSettingsWindowModuleName]: {
    component: SettingsWindow,
    identifier: diffSettingsWindowIdentifier,
    options: createSettingsWindowOptions(),
  },
} satisfies WindowsConfig;

const DiffWindowsNavigator = createWindowsNavigator(diffWindowsConfig);

type DiffWindow = keyof typeof diffWindowsConfig;

export function registerDiffWindows() {
  // Importing this module registers the windows above.
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
}

export function openDiffViewerWindow(sourceInput?: DiffOpenSource | string | null) {
  const source = normalizeDiffOpenSource(sourceInput);
  const startedAt = nowMs();
  logDiffOpenTiming("window.open.start", {
    source,
  });

  return DiffWindowsNavigator.open(diffViewerWindowModuleName as DiffWindow, {
    initialProperties: source ? { source } : undefined,
    representedURL: source?.value,
    title: getDiffSourceLabel(source),
    transparentBackground: true,
    windowStyle: createDiffViewerWindowStyle({ includeFrame: true, showViewModeToolbar: false }),
  }).then((result) => {
    logDiffOpenTiming("window.open.finish", {
      source,
      windowOpenMs: Number((nowMs() - startedAt).toFixed(1)),
    });
    return result;
  });
}

export function prefetchDiffViewerWindow() {
  return DiffWindowsNavigator.prefetch(diffViewerWindowModuleName as DiffWindow);
}

export function openDiffSettingsWindow() {
  return DiffWindowsNavigator.open(diffSettingsWindowModuleName as DiffWindow);
}

export function setDiffViewerWindowOptions({
  appearance,
  backgroundColor,
  source,
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  viewMode,
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  source: DiffOpenSource | null;
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  sidebarCollapsed: boolean;
  viewMode: DiffViewMode;
}) {
  const startedAt = nowMs();
  return setWindowOptions(diffViewerWindowIdentifier, {
    representedURL: source?.value,
    title: getDiffSourceLabel(source),
    windowStyle: createDiffViewerWindowStyle({
      appearance,
      includeFrame: false,
      showSidebarControl,
      showViewModeToolbar,
      sidebarCollapsed,
      viewMode,
    }),
  }).then((result) => {
    logDiffOpenTiming("window.options.finish", {
      source,
      setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
    });
    return result;
  });
}
