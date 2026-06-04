import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import {
  setWindowTitle,
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

function createMarkdownEditorWindowStyle() {
  const theme = getLegendTheme(getMarkdownThemeSetting());

  return {
    backgroundColor: theme.colors.windowBackground,
    width: 900,
    height: 700,
    minWidth: 520,
    minHeight: 420,
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
      windowStyle: createMarkdownEditorWindowStyle(),
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
    initialProperties: launchArguments ? { launchArguments } : undefined,
    windowStyle: createMarkdownEditorWindowStyle(),
  });
}

export function setMarkdownEditorWindowOptions({
  filename,
  isDirty,
  isUntitledDocument,
}: {
  filename: string;
  isDirty: boolean;
  isUntitledDocument: boolean;
}) {
  const title = isUntitledDocument ? "Untitled" : getMarkdownFileTitle(filename);
  return setWindowTitle(editorWindowIdentifier, isDirty ? `• ${title}` : title);
}
