import {
  openWindow,
  setMainWindowOptions,
  WindowStyleMask,
} from "@legend-desktop/window-manager";
import { AppRegistry } from "react-native";
import { getMarkdownFileTitle } from "./appMetadata";
import {
  settingsWindowIdentifier,
  settingsWindowModuleName,
} from "./appConstants";
import { SettingsWindow } from "./SettingsWindow";

let didRegisterWindows = false;

export function registerMarkdownWindows() {
  if (didRegisterWindows) {
    return;
  }

  AppRegistry.registerComponent(settingsWindowModuleName, () => SettingsWindow);
  didRegisterWindows = true;
}

export function openMarkdownSettingsWindow() {
  return openWindow({
    identifier: settingsWindowIdentifier,
    moduleName: settingsWindowModuleName,
    title: "Settings",
    transparentBackground: true,
    windowStyle: {
      hasToolbar: true,
      height: 800,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Resizable,
        WindowStyleMask.FullSizeContentView,
        WindowStyleMask.UnifiedTitleAndToolbar,
      ],
      minHeight: 600,
      minWidth: 600,
      titlebarAppearsTransparent: false,
      titlebarSeparatorStyle: "line",
      titleVisibility: "visible",
      toolbarStyle: "unified",
      width: 800,
    },
  });
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
