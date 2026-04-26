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
    macos: ["@legend-desktop/appkit-split-view", "@legend-desktop/music-test"],
    ios: ["@legend-desktop/appkit-split-view", "@legend-desktop/music-test"],
    android: ["@legend-desktop/appkit-split-view", "@legend-desktop/music-test"],
  },
} satisfies AppManifest;

export default manifest;
