import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "music",
  displayName: "Legend Music",
  platforms: ["macos", "ios", "android"],
  bundleIds: {
    ios: "so.legend.music",
    macos: "so.legend.music.macos",
  },
  androidPackage: "so.legend.music",
  expoModules: {
    macos: false,
  },
  hostWindow: {
    macos: {
      startupBackgroundColors: {
        dark: "#191A1B",
        light: "#f5f6f8",
      },
    },
  },
  nativeModules: {
    macos: [
      "@legend-apps/storage",
      "@legendapp/spark/app",
      "@legend-apps/apple-music",
      "@legend-apps/audio-player",
      "@legendapp/spark/updates",
      "@legendapp/spark/ai/codex",
      "@legendapp/spark/context-menu",
      "@legendapp/spark/drag-drop",
      "@legendapp/spark/dialogs",
      "@legendapp/spark/files",
      "@legendapp/spark/ui",
      "@legendapp/spark/global-shortcuts",
      "@legendapp/spark/shortcuts",
      "@legend-apps/media-library-scanner",
      "@legend-apps/media-tags",
      "@legendapp/spark/menus",
      "@legend-apps/oauth-loopback",
      "@legendapp/spark/secure-storage",
      "@legend-apps/crypto",
      "@legendapp/spark/windows",
      "react-native-webview",
    ],
    ios: [],
    android: [],
  },
  infoPlist: {
    macos: {
      SparkKeychainServices: ["so.legend.music.providers"],
      NSAppleMusicUsageDescription: "Legend Music uses Apple Music to search your catalog, show playlists, and play tracks.",
    },
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
