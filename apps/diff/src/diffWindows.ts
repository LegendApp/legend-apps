import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions, WindowStyleMask } from "@legend-desktop/window-manager";
import {
  diffSettingsWindowIdentifier,
  diffSettingsWindowModuleName,
  diffViewerWindowIdentifier,
  diffViewerWindowModuleName,
} from "./appConstants";
import { getFilename } from "./diffFiles";
import { getDiffSyntaxTheme } from "./diffSettings";
import { SettingsWindow } from "./SettingsWindow";

function createDiffViewerWindowStyle({
  appearance,
  includeFrame,
}: {
  appearance?: "dark" | "light";
  includeFrame: boolean;
}) {
  const syntaxTheme = getDiffSyntaxTheme();

  return {
    appearance: appearance ?? syntaxTheme.appearance,
    ...(includeFrame
      ? {
          width: 1180,
          height: 780,
          minWidth: 640,
          minHeight: 460,
        }
      : null),
    hasToolbar: true,
    mask: [
      WindowStyleMask.Titled,
      WindowStyleMask.Closable,
      WindowStyleMask.Miniaturizable,
      WindowStyleMask.Resizable,
      WindowStyleMask.FullSizeContentView,
      WindowStyleMask.UnifiedTitleAndToolbar,
    ],
    titlebarAppearsTransparent: true,
    titlebarSeparatorStyle: "none" as const,
    titleVisibility: "visible" as const,
    toolbarStyle: "unified" as const,
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
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  folderPath: string | null;
}) {
  const startedAt = nowMs();
  return setWindowOptions(diffViewerWindowIdentifier, {
    representedURL: folderPath,
    title: folderPath ? getFilename(folderPath) : "Legend Diff",
    windowStyle: createDiffViewerWindowStyle({
      appearance,
      includeFrame: false,
    }),
  }).then((result) => {
    logDiffOpenTiming("window.options.finish", {
      folderPath,
      setOptionsMs: Number((nowMs() - startedAt).toFixed(1)),
    });
    return result;
  });
}
