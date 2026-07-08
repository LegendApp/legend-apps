import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "markdown",
  displayName: "Legend Markdown",
  platforms: ["macos"],
  bundleIds: {
    ios: "app.legend.markdown",
    macos: "app.legend.markdown.macos",
  },
  androidPackage: "app.legend.markdown",
  hostWindow: {
    macos: {
      hidden: true,
    },
  },
  nativeModules: {
    macos: [
      "@legend-desktop/app-exit",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/context-menu",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/keyboard-manager",
      "@legend-desktop/markdown-block-editor",
      "@legend-desktop/markdown-parser",
      "@legend-desktop/native-menu",
      "@legend-desktop/native-select",
      "@legend-desktop/recent-documents",
      "@legend-desktop/sf-symbol",
      "@legend-desktop/storage",
      "@legend-desktop/window-manager",
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
