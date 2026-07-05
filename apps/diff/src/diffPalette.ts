import type { LegendDisplayThemeColors } from "@legend-desktop/theme";
import type { SyntaxTheme } from "@legend-desktop/syntax-parser";

export type DiffPalette = {
  background: string;
  border: string;
  danger: string;
  fileHeaderBackground: string;
  foreground: string;
  hunkHeaderBackground: string;
  muted: string;
  primary: string;
  sidebarBackground: string;
  sidebarConflictBadgeBackground: string;
  sidebarConflictBadgeText: string;
  sidebarFolder: string;
  sidebarSelectedBackground: string;
  sidebarSelectedBorder: string;
  surface: string;
  surfaceMuted: string;
};

function parseHexColor(color: string) {
  const normalized = color.trim().replace(/^#/, "");
  const hex = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }
  return {
    b: Number.parseInt(hex.slice(4, 6), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    r: Number.parseInt(hex.slice(0, 2), 16),
  };
}

function toHexColor({ b, g, r }: { b: number; g: number; r: number }) {
  const toHexComponent = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHexComponent(r)}${toHexComponent(g)}${toHexComponent(b)}`;
}

function mixHexColor(color: string, targetColor: string, amount: number, fallbackColor: string) {
  const parsedColor = parseHexColor(color);
  const parsedTarget = parseHexColor(targetColor);
  if (!parsedColor || !parsedTarget) {
    return fallbackColor;
  }
  return toHexColor({
    b: parsedColor.b + (parsedTarget.b - parsedColor.b) * amount,
    g: parsedColor.g + (parsedTarget.g - parsedColor.g) * amount,
    r: parsedColor.r + (parsedTarget.r - parsedColor.r) * amount,
  });
}

function getReadableBadgeTextColor(backgroundColor: string) {
  const parsedColor = parseHexColor(backgroundColor);
  if (!parsedColor) {
    return "#ffffff";
  }
  const luminance = (0.2126 * parsedColor.r + 0.7152 * parsedColor.g + 0.0722 * parsedColor.b) / 255;
  return luminance > 0.55 ? "#111827" : "#ffffff";
}

export function getDiffPalette(codeTheme: SyntaxTheme, displayColors: LegendDisplayThemeColors): DiffPalette {
  const { appearance, background, foreground } = codeTheme;
  const border = mixHexColor(foreground, background, appearance === "dark" ? 0.84 : 0.86, displayColors.border);
  const surface = mixHexColor(background, foreground, appearance === "dark" ? 0.045 : 0.035, displayColors.surface);
  const surfaceMuted = mixHexColor(background, foreground, appearance === "dark" ? 0.075 : 0.06, displayColors.surfaceMuted);
  const muted = mixHexColor(foreground, background, appearance === "dark" ? 0.43 : 0.5, displayColors.muted);
  const fileHeaderBackground = mixHexColor(background, foreground, appearance === "dark" ? 0.11 : 0.065, surfaceMuted);
  const hunkHeaderBackground = mixHexColor(background, foreground, appearance === "dark" ? 0.055 : 0.035, surface);
  const sidebarBackground = mixHexColor(background, foreground, appearance === "dark" ? 0.035 : 0.025, surface);
  const sidebarFolder = mixHexColor(muted, background, 0.22, muted);
  const sidebarSelectedBackground = mixHexColor(
    background,
    displayColors.primary,
    appearance === "dark" ? 0.28 : 0.18,
    surfaceMuted,
  );

  return {
    background,
    border,
    danger: displayColors.danger,
    fileHeaderBackground,
    foreground,
    hunkHeaderBackground,
    muted,
    primary: displayColors.primary,
    sidebarBackground,
    sidebarConflictBadgeBackground: displayColors.danger,
    sidebarConflictBadgeText: getReadableBadgeTextColor(displayColors.danger),
    sidebarFolder,
    sidebarSelectedBackground,
    sidebarSelectedBorder: displayColors.primary,
    surface,
    surfaceMuted,
  };
}
