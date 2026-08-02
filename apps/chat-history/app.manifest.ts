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
  nativeModules: {
    macos: [
      "@legend-apps/appkit-split-view",
      "@legend-apps/chat-history",
      "@legend-apps/sidebar",
      "@legend-apps/storage",
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
