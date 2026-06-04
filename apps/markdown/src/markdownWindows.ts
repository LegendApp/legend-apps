import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createWindowsNavigator, type WindowsConfig } from "@legend-desktop/windows";
import {
  setMainWindowOptions,
  WindowStyleMask,
} from "@legend-desktop/window-manager";
import { getMarkdownFileTitle } from "./appMetadata";
import {
  settingsWindowIdentifier,
  settingsWindowModuleName,
} from "./appConstants";
import { SettingsWindow } from "./SettingsWindow";

const markdownWindowsConfig = {
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

export function setMarkdownMainWindowOptions({
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

  return setMainWindowOptions({
    representedURL: null,
    title: isDirty ? `• ${title}` : title,
    windowStyle: {
      backgroundColor,
      hasToolbar: false,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Miniaturizable,
        WindowStyleMask.Resizable,
      ],
      titlebarAppearsTransparent: true,
      titlebarSeparatorStyle: "none",
      titleVisibility: "visible",
    },
  });
}
