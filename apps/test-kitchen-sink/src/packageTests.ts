import type { KitchenSinkPackage, KitchenSinkTest } from "@legend-desktop/appkit-split-view";
import { WindowStyleMask, type WindowOptions } from "@legend-desktop/window-manager";

export type KitchenSinkTestConfig = KitchenSinkTest & {
  windowOptions?: WindowOptions;
};

export const packages: KitchenSinkPackage[] = [
  {
    id: "app-exit",
    title: "App Exit",
  },
  {
    id: "appkit-split-view",
    title: "AppKit SplitView",
  },
  {
    id: "auto-updater",
    title: "Auto Updater",
  },
  {
    id: "context-menu",
    title: "Context Menu",
  },
  {
    id: "file-dialog",
    title: "File Dialog",
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
    id: "global-hotkey",
    title: "Global Hotkey",
  },
  {
    id: "native-menu",
    title: "Native Menu",
  },
  {
    id: "sf-symbol",
    title: "SF Symbol",
  },
  {
    id: "window-controls",
    title: "Window Controls",
  },
  {
    id: "window-manager",
    title: "Window Manager",
  },
];

export const tests: KitchenSinkTestConfig[] = [
  {
    id: "app-exit-events",
    packageId: "app-exit",
    title: "Exit Events",
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
    windowOptions: {
      windowStyle: {
        hasToolbar: true,
        mask: [
          WindowStyleMask.Titled,
          WindowStyleMask.Closable,
          WindowStyleMask.Miniaturizable,
          WindowStyleMask.Resizable,
          WindowStyleMask.FullSizeContentView,
        ],
        titlebarAppearsTransparent: true,
        titlebarSeparatorStyle: "none",
        titleVisibility: "visible",
        toolbarStyle: "unified",
      },
    },
  },
  {
    id: "auto-updater-status",
    packageId: "auto-updater",
    title: "Updater Status",
  },
  {
    id: "context-menu-show",
    packageId: "context-menu",
    title: "Show Menu",
  },
  {
    id: "file-dialog-open-save",
    packageId: "file-dialog",
    title: "Open and Save",
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
    id: "global-hotkey-register",
    packageId: "global-hotkey",
    title: "Register Hotkey",
  },
  {
    id: "native-menu-configure",
    packageId: "native-menu",
    title: "Configure Menu",
  },
  {
    id: "sf-symbol-basic",
    packageId: "sf-symbol",
    title: "Basic Symbol",
  },
  {
    id: "window-controls-visibility",
    packageId: "window-controls",
    title: "Visibility",
  },
  {
    id: "window-manager-open-configure",
    packageId: "window-manager",
    title: "Open and Configure",
  },
];

export function testsForPackage(packageId: string) {
  return tests.filter((test) => test.packageId === packageId);
}
