import type { AppManifest } from "../../scripts/lib/types";

const manifest = {
  id: "hello-world",
  displayName: "Legend Hello World",
  platforms: ["macos"],
  bundleIds: {
    ios: "so.legend.helloworld",
    macos: "so.legend.helloworld.macos",
  },
  androidPackage: "so.legend.helloworld",
  expoModules: {
    macos: false,
  },
  hostWindow: {
    macos: {
      hidden: false,
      startupBackgroundColors: {
        dark: "#ffffff",
        light: "#ffffff",
      },
    },
  },
  nativeModules: {
    macos: [],
    ios: [],
    android: [],
  },
} satisfies AppManifest;

export default manifest;
