import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "git",
  displayName: "Legend Git",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.git",
    macos: "so.legend.git.macos",
  },
  androidPackage: "so.legend.git",
  expoModules: { macos: false },
  hostWindow: { macos: { hidden: false } },
  nativeModules: {
    macos: [
      "@legendapp/spark/ui",
      "@legendapp/spark/processes",
      "@legend-apps/diff-parser",
      "@legend-apps/syntax-parser",
      "@legend-apps/file-system-watcher",
      "@legendapp/spark/dialogs",
      "@legendapp/spark/menus",
      "@legendapp/spark/windows",
      "@legendapp/spark/clipboard",
      "@legendapp/spark/context-menu",
      "@legendapp/spark/links",
    ],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
