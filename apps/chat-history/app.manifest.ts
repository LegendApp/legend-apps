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
      "@legendapp/spark-ui",
      "@legendapp/spark-updates",
      "@legend-apps/chat-history",
      "@legendapp/spark-native-menu",
      "@legendapp/spark-settings",
      "@legendapp/spark-desktop-windows",
      "react-native-enriched-markdown",
    ],
    ios: [],
    android: [],
  },
  release: {
    macos: {
      sparkle: {
        publicEdKey: "znYpZf1eiRuYn6a/gq4mBX6uWQWEc49rTZTlAAraJRU=",
      },
    },
  },
} satisfies AppManifest;

export default manifest;
