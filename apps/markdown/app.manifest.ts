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
    macos: [],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
