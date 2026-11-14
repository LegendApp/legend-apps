import { PlatformColor, type ColorValue } from "react-native";

export type DiffSystemColor = "systemOrangeColor" | "systemRedColor" | "systemGreenColor" | "systemBlueColor" | "controlAccentColor" | "linkColor" | "separatorColor" | "unemphasizedSelectedContentBackgroundColor";

// AppKit dynamic colors resolve against the window appearance, so they follow light and dark themes.
export function diffSystemColor(name: DiffSystemColor): ColorValue {
  return PlatformColor(name);
}

// Spark's SF Symbol view reads RGB channels and rejects catalog colors, so symbols use the system color values.
export const diffSymbolColors = { accent: "#0a84ff", blue: "#0a84ff", green: "#30d158", orange: "#ff9f0a", red: "#ff453a" } as const;
