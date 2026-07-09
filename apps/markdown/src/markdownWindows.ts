import { createSettingsWindowOptions } from "@legend-apps/settings-window";
import { createDocumentWindowStyle, createWindowsNavigator, type WindowsConfig } from "@legend-apps/windows";
import {
  closeWindow,
  setWindowOptions,
} from "@legend-apps/window-manager";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import type { MarkdownSaveState } from "@legend-apps/markdown-document";
import {
  editorWindowIdentifier,
  editorWindowModuleName,
  settingsWindowIdentifier,
  settingsWindowModuleName,
} from "./appConstants";
import { getMarkdownDisplayThemeSetting } from "./markdownSettings";
import { markdownEditorWindowTitle } from "./markdownWindowTitle";
import { SettingsWindow } from "./SettingsWindow";
import { loadMarkdownUserThemesSync } from "./userThemes";

loadMarkdownUserThemesSync();

function createMarkdownEditorWindowStyle({
  appearance,
  backgroundColor,
  includeFrame,
}: {
  appearance?: "dark" | "light";
  backgroundColor?: string;
  includeFrame: boolean;
}) {
  const displayThemeSetting = getMarkdownDisplayThemeSetting();
  const displayTheme = getLegendDisplayTheme(displayThemeSetting);

  return createDocumentWindowStyle({
    appearance: appearance ?? getLegendDisplayThemeAppearance(displayThemeSetting),
    backgroundColor: backgroundColor ?? displayTheme.colors.windowBackground,
    frame: {
      width: 900,
      height: 700,
      minWidth: 520,
      minHeight: 420,
    },
    includeFrame,
  });
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
  appearance,
  backgroundColor,
  filename,
  isDirty,
  isUntitledDocument,
  saveState,
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  filename: string;
  isDirty: boolean;
  isUntitledDocument: boolean;
  saveState: MarkdownSaveState;
}) {
  return setWindowOptions(editorWindowIdentifier, {
    title: markdownEditorWindowTitle({ filename, isDirty, isUntitledDocument, saveState }),
    windowStyle: createMarkdownEditorWindowStyle({ appearance, backgroundColor, includeFrame: false }),
  });
}
