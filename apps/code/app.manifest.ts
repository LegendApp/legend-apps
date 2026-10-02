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
      "@legendapp/spark/app",
      "@legendapp/spark/ui",
      "@legendapp/spark/context-menu",
      "@legendapp/spark/dialogs",
      "@legendapp/spark/files",
      "@legendapp/spark/menus",
      "@legend-apps/syntax-parser",
      "@legend-apps/source-editor",
      "@legendapp/spark/windows",
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
