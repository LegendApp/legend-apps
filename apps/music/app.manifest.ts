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
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/audio-player",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/media-library-scanner",
      "@legend-desktop/media-tags",
    ],
    ios: [
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/audio-player",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/media-library-scanner",
      "@legend-desktop/media-tags",
    ],
    android: [
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/audio-player",
      "@legend-desktop/file-dialog",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/media-library-scanner",
      "@legend-desktop/media-tags",
    ],
  },
} satisfies AppManifest;

export default manifest;
