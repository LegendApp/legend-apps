import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createUnifiedToolbarWindowStyle, createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions } from "@legend-desktop/window-manager";
import {
  diffSettingsWindowIdentifier,
  diffSettingsWindowModuleName,
  diffViewerWindowIdentifier,
  diffViewerWindowModuleName,
} from "./appConstants";
import { getFilename } from "./diffFiles";
import { diffViewModeOptions, getDiffSyntaxTheme, getDiffViewModeSetting, type DiffViewMode } from "./diffSettings";
import { SettingsWindow } from "./SettingsWindow";

export const diffViewModeToolbarItemId = "diff-view-mode";

function createDiffViewModeToolbarItem(selectedValue: DiffViewMode = getDiffViewModeSetting()) {
  return {
    id: diffViewModeToolbarItemId,
    label: "View Mode",
    selectedValue,
    segments: diffViewModeOptions.map((option) => ({
      label: option.label,
      value: option.value,
    })),
    type: "segmented" as const,
  };
}

function createDiffViewerWindowStyle({
  appearance,
  includeFrame,
  viewMode,
}: {
  appearance?: "dark" | "light";
  includeFrame: boolean;
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
    toolbarItems: [createDiffViewModeToolbarItem(viewMode)],
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

export function openDiffViewerWindow(folderPath?: string | null) {
  const startedAt = nowMs();
  logDiffOpenTiming("window.open.start", {
    folderPath,
  });

  return DiffWindowsNavigator.open(diffViewerWindowModuleName as DiffWindow, {
    initialProperties: folderPath ? { folderPath } : undefined,
    representedURL: folderPath,
    title: folderPath ? getFilename(folderPath) : "Legend Diff",
    transparentBackground: true,
    windowStyle: createDiffViewerWindowStyle({ includeFrame: true }),
  }).then((result) => {
    logDiffOpenTiming("window.open.finish", {
      folderPath,
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
  folderPath,
  viewMode,
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  folderPath: string | null;
  viewMode: DiffViewMode;
}) {
  const startedAt = nowMs();
  return setWindowOptions(diffViewerWindowIdentifier, {
    representedURL: folderPath,
    title: folderPath ? getFilename(folderPath) : "Legend Diff",
    windowStyle: createDiffViewerWindowStyle({
      appearance,
      includeFrame: false,
      viewMode,
    }),
  }).then((result) => {
    logDiffOpenTiming("window.options.finish", {
      folderPath,
      setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
    });
    return result;
  });
}
