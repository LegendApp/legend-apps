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
  expoModules: {
    macos: false,
  },
  hostWindow: {
    macos: {
      hidden: false,
      startupBackgroundColors: {
        dark: "#1e1e1e",
        light: "#ffffff",
      },
    },
  },
  urlSchemes: {
    macos: ["legend-diff"],
  },
  recentDocuments: { macos: true },
  nativeModules: {
    macos: [
      "@legendapp/spark-desktop-app",
      "@legendapp/spark-ui",
      "@legendapp/spark-updates",
      "@legendapp/spark-processes",
      "@legendapp/spark-context-menu",
      "@legend-apps/diff-parser",
      "@legendapp/spark-drag-drop",
      "@legendapp/spark-file-dialog",
      "@legendapp/spark-message-dialog",
      "@legendapp/spark-file-system",
      "@legendapp/spark-desktop-shortcuts",
      "@legendapp/spark-native-menu",
      "@legendapp/spark-settings",
      "@legend-apps/syntax-parser",
      "@legendapp/spark-desktop-windows",
    ],
    ios: [],
    android: [],
  },
  release: {
    macos: {
      sparkle: {
        publicEdKey: "znYpZf1eiRuYn6a/gq4mBX6uWQWEc49rTZTlAAraJRU=",
      },
    },
  },
} satisfies AppManifest;

export default manifest;
