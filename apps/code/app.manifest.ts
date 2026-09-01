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
  nativeModules: {
    macos: [
      "@legend-apps/app-exit",
      "@legend-apps/appkit-split-view",
      "@legend-apps/context-menu",
      "@legend-apps/file-dialog",
      "@legend-apps/file-system-watcher",
      "@legend-apps/native-menu",
      "@legend-apps/recent-documents",
      "@legend-apps/storage",
      "@legend-apps/syntax-parser",
      "@legend-apps/window-manager",
    ],
    ios: [],
    android: [],
  },
  documentTypes: {
    macos: [
      {
        name: "TypeScript source file",
        role: "Viewer",
        extensions: ["ts", "tsx"],
        contentTypes: ["public.source-code"],
      },
    ],
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
