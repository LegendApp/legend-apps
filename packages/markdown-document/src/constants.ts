import { Platform } from "react-native";

export const usesNativeEditorOverlay = Platform.OS === "macos";

export const estimatedItemSize = 120;
export const hydrateChunkSize = 512;
export const contentMaxWidth = 920;
export const contentHorizontalPadding = 40;
