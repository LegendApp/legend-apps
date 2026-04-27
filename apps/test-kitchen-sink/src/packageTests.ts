import type { KitchenSinkPackage, KitchenSinkTest } from "@legend-desktop/appkit-split-view";

export const packages: KitchenSinkPackage[] = [
  {
    id: "app-exit",
    title: "App Exit",
  },
  {
    id: "auto-updater",
    title: "Auto Updater",
  },
  {
    id: "appkit-split-view",
    title: "AppKit SplitView",
  },
  {
    id: "native-menu",
    title: "Native Menu",
  },
  {
    id: "file-dialog",
    title: "File Dialog",
  },
  {
    id: "context-menu",
    title: "Context Menu",
  },
  {
    id: "window-controls",
    title: "Window Controls",
  },
  {
    id: "global-hotkey",
    title: "Global Hotkey",
  },
  {
    id: "file-system-watcher",
    title: "File System Watcher",
  },
  {
    id: "glass-effect-view",
    title: "Glass Effect View",
  },
  {
    id: "sf-symbol",
    title: "SF Symbol",
  },
  {
    id: "music-test",
    title: "Music Test",
  },
];

export const tests: KitchenSinkTest[] = [
  {
    id: "app-exit-events",
    packageId: "app-exit",
    title: "Exit Events",
  },
  {
    id: "auto-updater-status",
    packageId: "auto-updater",
    title: "Updater Status",
  },
  {
    id: "split-view-basic",
    packageId: "appkit-split-view",
    title: "Basic SplitView",
  },
  {
    id: "split-view-liquid-glass",
    packageId: "appkit-split-view",
    title: "Liquid Glass Sidebar",
  },
  {
    id: "native-menu-configure",
    packageId: "native-menu",
    title: "Configure Menu",
  },
  {
    id: "file-dialog-open-save",
    packageId: "file-dialog",
    title: "Open and Save",
  },
  {
    id: "context-menu-show",
    packageId: "context-menu",
    title: "Show Menu",
  },
  {
    id: "window-controls-visibility",
    packageId: "window-controls",
    title: "Visibility",
  },
  {
    id: "global-hotkey-register",
    packageId: "global-hotkey",
    title: "Register Hotkey",
  },
  {
    id: "file-system-watcher-events",
    packageId: "file-system-watcher",
    title: "Watch Directory",
  },
  {
    id: "glass-effect-view-basic",
    packageId: "glass-effect-view",
    title: "Basic Glass",
  },
  {
    id: "sf-symbol-basic",
    packageId: "sf-symbol",
    title: "Basic Symbol",
  },
  {
    id: "music-native-view",
    packageId: "music-test",
    title: "Native View",
  },
];

export function testsForPackage(packageId: string) {
  return tests.filter((test) => test.packageId === packageId);
}
