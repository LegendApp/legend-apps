import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "chat-history",
  displayName: "Legend Chat History",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.chathistory",
    macos: "so.legend.chathistory.macos",
  },
  androidPackage: "so.legend.chathistory",
  expoModules: {
    macos: false,
  },
  hostWindow: {
    macos: {
      hidden: false,
      startupBackgroundColors: {
        dark: "#191A1B",
        light: "#f5f6f8",
      },
    },
  },
  nativeModules: {
    macos: [
      "@legend-apps/appkit-split-view",
      "@legend-apps/chat-history",
      "@legend-apps/glass-effect-view",
      "@legend-apps/storage",
      "@legend-apps/window-manager",
      "react-native-enriched-markdown",
    ],
    ios: [],
    android: [],
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
