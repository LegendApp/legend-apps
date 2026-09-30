import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "slides",
  displayName: "Legend Slides",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.slides",
    macos: "so.legend.slides.macos",
  },
  androidPackage: "so.legend.slides",
  hostWindow: {
    macos: { hidden: true },
  },
  recentDocuments: { macos: true },
  nativeModules: {
    macos: [
      "@legend-apps/storage",
      "@legendapp/spark-desktop-app",
      "@legendapp/spark-ui",
      "@legendapp/spark-processes",
      "@legendapp/spark-context-menu",
      "@legendapp/spark-file-dialog",
      "@legendapp/spark-message-dialog",
      "@legendapp/spark-file-system",
      "@legendapp/spark-desktop-shortcuts",
      "@legendapp/spark-native-menu",
      "@legend-apps/scaled-view",
      "@legendapp/spark-settings",
      "@legend-apps/source-editor",
      "@legend-apps/syntax-parser",
      "@legendapp/spark-desktop-windows",
      "@shopify/react-native-skia",
      "react-native-reanimated",
      "react-native-worklets",
      "lottie-react-native",
      "react-native-enriched-markdown",
      "react-native-webgpu",
      "react-native-webview",
    ],
    ios: [],
    android: [],
  },
  documentTypes: {
    macos: [
      {
        name: "MDX presentation",
        role: "Editor",
        extensions: ["mdx"],
        contentTypes: ["public.source-code"],
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
