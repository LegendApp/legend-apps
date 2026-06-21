import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import { setWindowOptions, WindowStyleMask } from "@legend-desktop/window-manager";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance } from "@legend-desktop/theme";
import { codeViewerWindowIdentifier, codeViewerWindowModuleName } from "./appConstants";
import { getFilename } from "./codeFiles";

function createCodeViewerWindowStyle({
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
          width: 1080,
          height: 760,
          minWidth: 560,
          minHeight: 420,
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

const codeWindowsConfig = {
  [codeViewerWindowModuleName]: {
    loadComponent: () => import("./CodeViewerWindow"),
    identifier: codeViewerWindowIdentifier,
    options: {
      title: "Legend Code",
      windowStyle: createCodeViewerWindowStyle({ includeFrame: true }),
    },
  },
} satisfies WindowsConfig;

const CodeWindowsNavigator = createWindowsNavigator(codeWindowsConfig);

type CodeWindow = keyof typeof codeWindowsConfig;

export function registerCodeWindows() {
  // Importing this module registers the windows above.
}

export function openCodeViewerWindow(launchArguments?: string[]) {
  return CodeWindowsNavigator.open(codeViewerWindowModuleName as CodeWindow, {
    initialProperties: launchArguments ? { launchArguments } : undefined,
    windowStyle: createCodeViewerWindowStyle({ includeFrame: true }),
  });
}

export function setCodeViewerWindowOptions({
  backgroundColor,
  filePath,
}: {
  backgroundColor: string;
  filePath: string | null;
}) {
  return setWindowOptions(codeViewerWindowIdentifier, {
    representedURL: filePath,
    title: filePath ? getFilename(filePath) : "Legend Code",
    windowStyle: createCodeViewerWindowStyle({
      appearance: getLegendDisplayThemeAppearance("dark"),
      backgroundColor,
      includeFrame: false,
    }),
  });
}
