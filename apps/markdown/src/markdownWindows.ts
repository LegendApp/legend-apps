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
  isUntitledDocument,
}: {
  backgroundColor: string;
  filename: string;
  isUntitledDocument: boolean;
}) {
  return setMainWindowOptions({
    representedURL: null,
    title: isUntitledDocument ? "Untitled" : getMarkdownFileTitle(filename),
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
