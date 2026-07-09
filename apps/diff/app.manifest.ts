import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "diff",
  displayName: "Legend Diff",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.diff",
    macos: "so.legend.diff.macos",
  },
  androidPackage: "so.legend.diff",
  hostWindow: {
    macos: {
      hidden: true,
    },
  },
  urlSchemes: {
    macos: ["legend-diff"],
  },
  nativeModules: {
    macos: [
      "@legend-apps/app-exit",
      "@legend-apps/appkit-split-view",
      "@legend-apps/auto-updater",
      "@legend-apps/command-runner",
      "@legend-apps/context-menu",
      "@legend-apps/diff-parser",
      "@legend-apps/drag-drop",
      "@legend-apps/file-dialog",
      "@legend-apps/file-system-watcher",
      "@legend-apps/glass-effect-view",
      "@legend-apps/instrumentation",
      "@legend-apps/keyboard-manager",
      "@legend-apps/native-menu",
      "@legend-apps/native-select",
      "@legend-apps/recent-documents",
      "@legend-apps/sf-symbol",
      "@legend-apps/storage",
      "@legend-apps/syntax-parser",
      "@legend-apps/text-input-search",
      "@legend-apps/window-manager",
    ],
    ios: [],
    android: [],
  },
  release: {
    macos: {
      build: "1",
      sparkle: {
        publicEdKey: "znYpZf1eiRuYn6a/gq4mBX6uWQWEc49rTZTlAAraJRU=",
      },
    },
  },
} satisfies AppManifest;

export default manifest;
