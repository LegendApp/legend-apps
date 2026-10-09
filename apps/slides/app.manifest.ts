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
  urlSchemes: { macos: ["legend-slides"] },
  nativeModules: {
    macos: [
      "@legend-apps/storage",
      "@legendapp/spark/app",
      "@legendapp/spark/ui",
      "@legendapp/spark/processes",
      "@legendapp/spark/context-menu",
      "@legendapp/spark/dialogs",
      "@legendapp/spark/files",
      "@legendapp/spark/shortcuts",
      "@legendapp/spark/menus",
      "@legend-apps/scaled-view",
      "@legend-apps/source-editor",
      "@legend-apps/syntax-parser",
      "@legendapp/spark/windows",
      "@legendapp/spark/system",
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
