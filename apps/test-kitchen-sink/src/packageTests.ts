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
    id: "music-native-view",
    packageId: "music-test",
    title: "Native View",
  },
];

export function testsForPackage(packageId: string) {
  return tests.filter((test) => test.packageId === packageId);
}
