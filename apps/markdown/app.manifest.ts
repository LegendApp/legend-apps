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
      "@legendapp/spark-desktop-shortcuts",
      "@legend-apps/markdown-block-editor",
      "@legend-apps/markdown-parser",
      "@legendapp/spark-native-menu",
      "@legendapp/spark-desktop-windows",
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
      sparkle: {
        publicEdKey: "znYpZf1eiRuYn6a/gq4mBX6uWQWEc49rTZTlAAraJRU=",
      },
    },
  },
} satisfies AppManifest;

export default manifest;
