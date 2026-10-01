import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "code",
  displayName: "Legend Code",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.code",
    macos: "so.legend.code.macos",
  },
  androidPackage: "so.legend.code",
  expoModules: {
    macos: false,
  },
  hostWindow: {
    macos: {
      hidden: true,
    },
  },
  recentDocuments: { macos: true },
  nativeModules: {
    macos: [
      "@legend-apps/storage",
      "@legendapp/spark-desktop-app",
      "@legendapp/spark-ui",
      "@legendapp/spark-context-menu",
      "@legendapp/spark-file-dialog",
      "@legendapp/spark-message-dialog",
      "@legendapp/spark-file-system",
      "@legendapp/spark-native-menu",
      "@legend-apps/syntax-parser",
      "@legend-apps/source-editor",
      "@legendapp/spark-desktop-windows",
    ],
    ios: [],
    android: [],
  },
  documentTypes: {
    macos: [
      {
        name: "Text file",
        role: "Editor",
        extensions: ["*"],
        contentTypes: ["public.text"],
      },
    ],
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
