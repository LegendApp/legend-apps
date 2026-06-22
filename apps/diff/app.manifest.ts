import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "diff",
  displayName: "Legend Diff",
  platforms: ["macos"],
  bundleIds: {
    ios: "app.legend.diff",
    macos: "app.legend.diff.macos",
  },
  androidPackage: "app.legend.diff",
  hostWindow: {
    macos: {
      hidden: true,
    },
  },
  nativeModules: {
    macos: [
      "@legend-desktop/diff-parser",
      "@legend-desktop/file-dialog",
      "@legend-desktop/native-menu",
      "@legend-desktop/window-manager",
    ],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
