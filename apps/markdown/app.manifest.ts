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
  nativeModules: {
    macos: [
      "@legend-desktop/app-exit",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/file-dialog",
      "@legend-desktop/keyboard-manager",
      "@legend-desktop/markdown-block-editor",
      "@legend-desktop/markdown-parser",
      "@legend-desktop/native-menu",
      "@legend-desktop/recent-documents",
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
} satisfies AppManifest;

export default manifest;
