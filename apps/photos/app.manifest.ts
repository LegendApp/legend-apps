import type { AppManifest } from "../../scripts/lib/types";
export default {
  id: "photos", displayName: "Legend Photos", platforms: ["macos"],
  bundleIds: {ios: "com.legendapp.legend-photos", macos: "com.legendapp.legend-photos"}, androidPackage: "com.legendapp.photos",
  expoModules: {macos: false},
  hostWindow: {macos: {startupBackgroundColors: {dark: "#191A1B", light: "#f5f6f8"}}},
  nativeModules: {macos: ["@legend-apps/storage", "@legend-apps/color-picker", "@legend-apps/photo-library", "@legendapp/spark/app", "@legendapp/spark/windows", "@legendapp/spark/shortcuts", "@legendapp/spark/files", "@legendapp/spark/dialogs", "@legendapp/spark/menus", "@legendapp/spark/ui", "@legendapp/spark/updates"], ios: [], android: []},
  infoPlist: {macos: {NSPhotoLibraryUsageDescription: "Legend Photos uses your photo library to display your albums and photos."}},
  release: {macos: {sparkle: {publicEdKey: "+9sqbwuHh6jqJHe35pGeXrZBCnQlH8tj3/q8NX+STQE="}}},
} satisfies AppManifest;
