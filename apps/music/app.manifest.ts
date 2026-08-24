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
  nativeModules: {
    macos: [
      "@legend-apps/app-exit",
      "@legend-apps/apple-music",
      "@legend-apps/audio-player",
      "@legend-apps/auto-updater",
      "@legend-apps/codex",
      "@legend-apps/context-menu",
      "@legend-apps/drag-drop",
      "@legend-apps/file-dialog",
      "@legend-apps/file-system-watcher",
      "@legend-apps/glass-effect-view",
      "@legend-apps/global-hotkey",
      "@legend-apps/keyboard-manager",
      "@legend-apps/media-library-scanner",
      "@legend-apps/media-tags",
      "@legend-apps/native-menu",
      "@legend-apps/sf-symbol",
      "@legend-apps/sidebar",
      "@legend-apps/storage",
      "@legend-apps/appkit-split-view",
      "@legend-apps/text-input-search",
      "@legend-apps/window-controls",
      "@legend-apps/window-manager",
      "react-native-webview",
    ],
    ios: [],
    android: [],
  },
  urlSchemes: {
    macos: ["legendmusic"],
  },
  infoPlist: {
    macos: {
      NSAppleMusicUsageDescription: "Legend Music uses Apple Music to search your catalog, show playlists, and play tracks.",
    },
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
