import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import {
  closeWindow,
  WindowStyleMask,
} from "@legend-desktop/window-manager";
import { getLegendTheme } from "@legend-desktop/theme";
import { getMarkdownFileTitle } from "./appMetadata";
import {
  editorWindowIdentifier,
  editorWindowModuleName,
  settingsWindowIdentifier,
  settingsWindowModuleName,
} from "./appConstants";
import { getMarkdownThemeSetting } from "./markdownSettings";
import { SettingsWindow } from "./SettingsWindow";
import { loadMarkdownUserThemesSync } from "./userThemes";

loadMarkdownUserThemesSync();

function createMarkdownEditorWindowStyle({
  backgroundColor,
  includeFrame,
}: {
  backgroundColor?: string;
  includeFrame: boolean;
}) {
  const theme = getLegendTheme(getMarkdownThemeSetting());

  return {
    backgroundColor: backgroundColor ?? theme.colors.windowBackground,
    ...(includeFrame
      ? {
          width: 900,
          height: 700,
          minWidth: 520,
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

const markdownWindowsConfig = {
  [editorWindowModuleName]: {
    loadComponent: () => import("./MarkdownEditorWindow"),
    identifier: editorWindowIdentifier,
    options: {
      title: "Untitled",
      windowStyle: createMarkdownEditorWindowStyle({ includeFrame: true }),
    },
  },
  [settingsWindowModuleName]: {
    component: SettingsWindow,
    identifier: settingsWindowIdentifier,
    options: createSettingsWindowOptions(),
  },
} satisfies WindowsConfig;

const MarkdownWindowsNavigator = createWindowsNavigator(markdownWindowsConfig);

type MarkdownWindow = keyof typeof markdownWindowsConfig;

export function registerMarkdownWindows() {
  // Importing this module registers the windows above.
}

export function openMarkdownSettingsWindow() {
  return MarkdownWindowsNavigator.open(settingsWindowModuleName as MarkdownWindow);
}

export function openMarkdownEditorWindow(launchArguments?: string[]) {
  return MarkdownWindowsNavigator.open(editorWindowModuleName as MarkdownWindow, {
    interceptClose: true,
    initialProperties: launchArguments ? { launchArguments } : undefined,
    windowStyle: createMarkdownEditorWindowStyle({ includeFrame: true }),
  });
}

export function closeMarkdownEditorWindow() {
  return closeWindow(editorWindowIdentifier);
}

export function setMarkdownEditorWindowOptions({
  backgroundColor,
  filename,
  isDirty,
  isUntitledDocument,
}: {
  backgroundColor: string;
  filename: string;
  isDirty: boolean;
  isUntitledDocument: boolean;
}) {
  const title = isUntitledDocument ? "Untitled" : getMarkdownFileTitle(filename);
  return MarkdownWindowsNavigator.open(editorWindowModuleName as MarkdownWindow, {
    interceptClose: true,
    title: isDirty ? `• ${title}` : title,
    windowStyle: createMarkdownEditorWindowStyle({ backgroundColor, includeFrame: false }),
  });
}
