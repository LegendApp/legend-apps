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

export function openMarkdownSettingsWindow(backgroundColor: string) {
  return openWindow({
    identifier: settingsWindowIdentifier,
    moduleName: settingsWindowModuleName,
    title: "Settings",
    windowStyle: {
      backgroundColor,
      hasToolbar: false,
      height: 560,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Resizable,
      ],
      minHeight: 420,
      minWidth: 560,
      titlebarAppearsTransparent: false,
      titlebarSeparatorStyle: "line",
      titleVisibility: "visible",
      width: 720,
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
