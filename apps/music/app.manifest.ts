import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "music",
  displayName: "Legend Music",
  platforms: ["macos", "ios", "android"],
  bundleIds: {
    ios: "app.legend.music",
    macos: "app.legend.music.macos",
  },
  androidPackage: "app.legend.music",
  nativeModules: {
    macos: [
      "@legend-desktop/app-exit",
      "@legend-desktop/audio-player",
      "@legend-desktop/auto-updater",
      "@legend-desktop/command-runner",
      "@legend-desktop/context-menu",
      "@legend-desktop/drag-drop",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/glass-effect-view",
      "@legend-desktop/global-hotkey",
      "@legend-desktop/keyboard-manager",
      "@legend-desktop/media-library-scanner",
      "@legend-desktop/media-tags",
      "@legend-desktop/native-menu",
      "@legend-desktop/sf-symbol",
      "@legend-desktop/sidebar",
      "@legend-desktop/storage",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/text-input-search",
      "@legend-desktop/window-controls",
      "@legend-desktop/window-manager",
    ],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
