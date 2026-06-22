import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions, WindowStyleMask } from "@legend-desktop/window-manager";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance } from "@legend-desktop/theme";
import { diffViewerWindowIdentifier, diffViewerWindowModuleName } from "./appConstants";
import { getFilename } from "./diffFiles";

function createDiffViewerWindowStyle({
  appearance,
  backgroundColor,
  includeFrame,
}: {
  appearance?: "dark" | "light";
  backgroundColor?: string;
  includeFrame: boolean;
}) {
  const displayTheme = getLegendDisplayTheme("dark");

  return {
    appearance: appearance ?? getLegendDisplayThemeAppearance("dark"),
    backgroundColor: backgroundColor ?? displayTheme.colors.windowBackground,
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

export function setDiffViewerWindowOptions({
  backgroundColor,
  folderPath,
}: {
  backgroundColor: string;
  folderPath: string | null;
}) {
  return setWindowOptions(diffViewerWindowIdentifier, {
    representedURL: folderPath,
    title: folderPath ? getFilename(folderPath) : "Legend Diff",
    windowStyle: createDiffViewerWindowStyle({
      appearance: getLegendDisplayThemeAppearance("dark"),
      backgroundColor,
      includeFrame: false,
    }),
  });
}
