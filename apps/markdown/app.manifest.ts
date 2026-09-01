import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "markdown",
  displayName: "Legend Markdown",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.markdown",
    macos: "so.legend.markdown.macos",
  },
  androidPackage: "so.legend.markdown",
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
      "@legend-apps/keyboard-manager",
      "@legend-apps/markdown-block-editor",
      "@legend-apps/markdown-parser",
      "@legend-apps/native-menu",
      "@legend-apps/native-select",
      "@legend-apps/recent-documents",
      "@legend-apps/sf-symbol",
      "@legend-apps/storage",
      "@legend-apps/window-manager",
      "react-native-enriched-markdown",
    ],
    ios: [],
    android: [],
  },
  documentTypes: {
    macos: [
      {
        name: "Markdown text file",
        role: "Editor",
        extensions: ["md", "markdown", "mdown", "mkd", "mdx"],
        contentTypes: ["net.daringfireball.markdown"],
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
