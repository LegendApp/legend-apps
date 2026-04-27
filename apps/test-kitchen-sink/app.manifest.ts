import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "test-kitchen-sink",
  displayName: "Legend Test Kitchen Sink",
  platforms: ["macos", "ios", "android"],
  bundleIds: {
    ios: "app.legend.testkitchensink",
    macos: "app.legend.testkitchensink.macos",
  },
  androidPackage: "app.legend.testkitchensink",
  nativeModules: {
    macos: [
      "@legend-desktop/app-exit",
      "@legend-desktop/auto-updater",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/native-menu",
      "@legend-desktop/file-dialog",
      "@legend-desktop/context-menu",
      "@legend-desktop/window-controls",
      "@legend-desktop/window-manager",
      "@legend-desktop/global-hotkey",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/glass-effect-view",
      "@legend-desktop/sf-symbol",
    ],
    ios: [
      "@legend-desktop/app-exit",
      "@legend-desktop/auto-updater",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/native-menu",
      "@legend-desktop/file-dialog",
      "@legend-desktop/context-menu",
      "@legend-desktop/window-controls",
      "@legend-desktop/window-manager",
      "@legend-desktop/global-hotkey",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/glass-effect-view",
      "@legend-desktop/sf-symbol",
    ],
    android: [
      "@legend-desktop/app-exit",
      "@legend-desktop/auto-updater",
      "@legend-desktop/appkit-split-view",
      "@legend-desktop/native-menu",
      "@legend-desktop/file-dialog",
      "@legend-desktop/context-menu",
      "@legend-desktop/window-controls",
      "@legend-desktop/window-manager",
      "@legend-desktop/global-hotkey",
      "@legend-desktop/file-system-watcher",
      "@legend-desktop/glass-effect-view",
      "@legend-desktop/sf-symbol",
    ],
  },
} satisfies AppManifest;

export default manifest;
