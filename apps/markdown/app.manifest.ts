import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "markdown",
  displayName: "Legend Markdown",
  platforms: ["macos", "ios", "android"],
  bundleIds: {
    ios: "app.legend.markdown",
    macos: "app.legend.markdown.macos",
  },
  androidPackage: "app.legend.markdown",
  nativeModules: {
    macos: [
      "@legend-desktop/file-dialog",
      "@legend-desktop/native-menu",
      "@legend-desktop/window-manager",
    ],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
