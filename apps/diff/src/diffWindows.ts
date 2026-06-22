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
  backgroundColor,
  includeFrame,
}: {
  appearance?: "dark" | "light";
  backgroundColor?: string;
  includeFrame: boolean;
}) {
  const syntaxTheme = getDiffSyntaxTheme();

  return {
    appearance: appearance ?? syntaxTheme.appearance,
    backgroundColor: backgroundColor ?? syntaxTheme.background,
    ...(includeFrame
      ? {
          width: 1180,
          height: 780,
          minWidth: 640,
          minHeight: 460,
        }
      : null),
    hasToolbar: false,
    mask: [
      WindowStyleMask.Titled,
      WindowStyleMask.Closable,
      WindowStyleMask.Miniaturizable,
      WindowStyleMask.Resizable,
      WindowStyleMask.FullSizeContentView,
    ],
    titlebarAppearsTransparent: true,
    titlebarSeparatorStyle: "none" as const,
    titleVisibility: "visible" as const,
  };
}

const diffWindowsConfig = {
  [diffViewerWindowModuleName]: {
    loadComponent: () => import("./DiffViewerWindow"),
    identifier: diffViewerWindowIdentifier,
    options: {
      title: "Legend Diff",
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

export function openDiffViewerWindow(folderPath?: string | null) {
  return DiffWindowsNavigator.open(diffViewerWindowModuleName as DiffWindow, {
    initialProperties: folderPath ? { folderPath } : undefined,
    windowStyle: createDiffViewerWindowStyle({ includeFrame: true }),
  });
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
  return setWindowOptions(diffViewerWindowIdentifier, {
    representedURL: folderPath,
    title: folderPath ? getFilename(folderPath) : "Legend Diff",
    windowStyle: createDiffViewerWindowStyle({
      appearance,
      backgroundColor,
      includeFrame: false,
    }),
  });
}
