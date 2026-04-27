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
    macos: [],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
