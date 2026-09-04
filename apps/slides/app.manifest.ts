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
  nativeModules: {
    macos: [
      "@legend-apps/command-runner",
      "@legend-apps/file-dialog",
      "@legend-apps/file-system-watcher",
      "@legend-apps/keyboard-manager",
      "@legend-apps/native-menu",
      "@legend-apps/recent-documents",
      "@legend-apps/scaled-view",
      "@legend-apps/storage",
      "@legend-apps/syntax-parser",
      "@legend-apps/window-manager",
      "@shopify/react-native-skia",
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
        role: "Viewer",
        extensions: ["mdx"],
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
