import { PlatformColor, type ColorValue } from "react-native";

export type DiffSystemColor = "systemOrangeColor" | "systemRedColor" | "systemGreenColor" | "systemBlueColor" | "controlAccentColor" | "separatorColor" | "unemphasizedSelectedContentBackgroundColor";

// AppKit dynamic colors resolve against the window appearance, so they follow light and dark themes.
export function diffSystemColor(name: DiffSystemColor): ColorValue {
  return PlatformColor(name);
}
