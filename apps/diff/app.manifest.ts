import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "diff",
  displayName: "Legend Diff",
  platforms: ["macos"],
  bundleIds: {
    ios: "app.legend.diff",
    macos: "app.legend.diff.macos",
  },
  androidPackage: "app.legend.diff",
  hostWindow: {
    macos: {
      hidden: true,
    },
  },
  nativeModules: {
    macos: [
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/auto-updater",
      "@legend-desktop/context-menu",
      "@legend-desktop/diff-parser",
      "@legend-desktop/drag-drop",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/native-menu",
      "@legend-desktop/recent-documents",
      "@legend-desktop/storage",
      "@legend-desktop/syntax-parser",
      "@legend-desktop/window-manager",
    ],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
