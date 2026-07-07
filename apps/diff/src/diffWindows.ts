import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { getLegendDisplayTheme } from "@legend-desktop/theme";
import { createUnifiedToolbarWindowStyle, createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions, type WindowFrame } from "@legend-desktop/window-manager";
import {
  diffSettingsWindowIdentifier,
  diffSettingsWindowModuleName,
  diffViewerWindowIdentifier,
  diffViewerWindowModuleName,
} from "./appConstants";
import { upsertSavedDiffWindow } from "./diffAppMetadata";
import { normalizeDiffOpenSource, type DiffOpenSource } from "./diffFiles";
import { logDiffOpenTiming } from "./diffInstrumentation";
import { getDiffPalette } from "./diffPalette";
import { diffViewModeOptions, getDiffSyntaxTheme, getDiffViewModeSetting, type DiffViewMode } from "./diffSettings";
import { diffViewerWindowTitle } from "./diffWindowTitle";
import { SettingsWindow } from "./SettingsWindow";

export const diffViewModeToolbarItemId = "diff-view-mode";
export const diffSidebarToolbarItemId = "diff-toggle-sidebar";
let diffViewerUntitledWindowId = 0;
let diffViewerUrlFocusRequestId = 0;
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

function createDiffViewerToolbarItems({
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  viewMode,
}: {
  showSidebarControl?: boolean;
  showViewModeToolbar?: boolean;
  sidebarCollapsed?: boolean;
  viewMode?: DiffViewMode;
}) {
  return [
    ...(showSidebarControl ? [createDiffSidebarToolbarItem(sidebarCollapsed)] : []),
    ...(showViewModeToolbar ? [createDiffViewModeToolbarItem(viewMode)] : []),
  ];
}

function createDiffViewerWindowStyle({
  appearance,
  includeFrame,
  includeToolbarItems = true,
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  viewMode,
}: {
  appearance?: "dark" | "light";
  includeFrame: boolean;
  includeToolbarItems?: boolean;
  showSidebarControl?: boolean;
  showViewModeToolbar?: boolean;
  sidebarCollapsed?: boolean;
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
    titleVisibility: "hidden" as const,
    titlebarControls: [],
    ...(includeToolbarItems
      ? {
          toolbarItems: createDiffViewerToolbarItems({
            showSidebarControl,
            showViewModeToolbar,
            sidebarCollapsed,
            viewMode,
          }),
        }
      : {}),
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
    options: createSettingsWindowOptions({ title: "Appearance" }),
  },
} satisfies WindowsConfig;

const DiffWindowsNavigator = createWindowsNavigator(diffWindowsConfig);

type DiffWindow = keyof typeof diffWindowsConfig;

type DiffViewerWindowOpenOptions = {
  focusUrlInput?: boolean;
  frame?: WindowFrame;
  freshWindow?: boolean;
  windowIdentifier?: string;
};

export function registerDiffWindows() {
  // Importing this module registers the windows above.
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function getDiffViewerWindowIdentifier(source: DiffOpenSource | null | undefined) {
  return source ? `${diffViewerWindowIdentifier}-${source.kind}-${hashString(source.value)}` : diffViewerWindowIdentifier;
}

function getFreshDiffViewerWindowIdentifier() {
  diffViewerUntitledWindowId += 1;
  return `${diffViewerWindowIdentifier}-untitled-${diffViewerUntitledWindowId}`;
}

export function openDiffViewerWindow(sourceInput?: DiffOpenSource | string | null, options: DiffViewerWindowOpenOptions = {}) {
  const source = normalizeDiffOpenSource(sourceInput);
  const windowIdentifier = options.windowIdentifier ??
    (options.freshWindow && source === null
    ? getFreshDiffViewerWindowIdentifier()
    : getDiffViewerWindowIdentifier(source));
  const shouldShowSourceToolbar = source !== null;
  const focusUrlInputRequestId = options.focusUrlInput ? ++diffViewerUrlFocusRequestId : undefined;
  const shouldPassWindowIdentifier = windowIdentifier !== diffViewerWindowIdentifier;
  const initialProperties = source || options.focusUrlInput || shouldPassWindowIdentifier
      ? {
        ...(source ? { source } : {}),
        ...(focusUrlInputRequestId ? { focusUrlInputRequestId } : {}),
        ...(shouldPassWindowIdentifier ? { windowIdentifier } : {}),
      }
    : undefined;
  const startedAt = nowMs();
  logDiffOpenTiming("window.open.start", () => ({
    focusUrlInput: options.focusUrlInput === true,
    source,
    windowIdentifier,
  }));
  const windowStyle = createDiffViewerWindowStyle({
    includeFrame: true,
    showSidebarControl: shouldShowSourceToolbar,
    showViewModeToolbar: shouldShowSourceToolbar,
  });
  if (options.frame) {
    windowStyle.width = options.frame.width;
    windowStyle.height = options.frame.height;
  }

  return DiffWindowsNavigator.open(diffViewerWindowModuleName as DiffWindow, {
    identifier: windowIdentifier,
    initialProperties,
    interceptClose: true,
    representedURL: source?.value,
    title: diffViewerWindowTitle({ hasUnsavedMergeDrafts: false, source }),
    transparentBackground: true,
    ...(options.frame ? { x: options.frame.x, y: options.frame.y } : {}),
    windowStyle,
  }).then((result) => {
    upsertSavedDiffWindow({
      ...(options.frame ? { frame: options.frame } : {}),
      id: windowIdentifier,
      ...(source ? { source } : {}),
    });
    logDiffOpenTiming("window.open.finish", () => ({
      focusUrlInput: options.focusUrlInput === true,
      source,
      windowIdentifier,
      windowOpenMs: Number((nowMs() - startedAt).toFixed(1)),
    }));
    return result;
  });
}

export function prefetchDiffViewerWindow() {
  return DiffWindowsNavigator.prefetch(diffViewerWindowModuleName as DiffWindow);
}

export function openDiffSettingsWindow() {
  return DiffWindowsNavigator.open(diffSettingsWindowModuleName as DiffWindow);
}

export function setDiffViewerWindowAppearance({
  appearance,
  windowIdentifier,
}: {
  appearance: "dark" | "light";
  windowIdentifier: string;
}) {
  return setWindowOptions(windowIdentifier, {
    windowStyle: {
      appearance,
    },
  });
}

export function setDiffViewerWindowToolbarOptions({
  source,
  hasUnsavedMergeDrafts,
  showSidebarControl,
  showViewModeToolbar,
  sidebarCollapsed,
  title,
  viewMode,
  windowIdentifier,
}: {
  source: DiffOpenSource | null;
  hasUnsavedMergeDrafts: boolean;
  showSidebarControl: boolean;
  showViewModeToolbar: boolean;
  sidebarCollapsed: boolean;
  title: string;
  viewMode: DiffViewMode;
  windowIdentifier: string;
}) {
  return setWindowOptions(windowIdentifier, {
    representedURL: source?.value,
    title,
    windowStyle: createDiffViewerWindowStyle({
      includeFrame: false,
      showSidebarControl,
      showViewModeToolbar,
      sidebarCollapsed,
      viewMode,
    }),
  });
}
