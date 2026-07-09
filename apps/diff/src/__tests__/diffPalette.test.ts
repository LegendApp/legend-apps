import type { LegendDisplayThemeColors } from "@legend-apps/theme";
import type { SyntaxTheme } from "@legend-apps/syntax-parser";
import { getDiffPalette } from "../diffPalette";

const displayColors: LegendDisplayThemeColors = {
  background: "#101010",
  blockquoteBackground: "#111111",
  blockquoteBorder: "#222222",
  border: "#333333",
  code: "#444444",
  codeForeground: "#dddddd",
  danger: "#ff453a",
  foreground: "#eeeeee",
  muted: "#777777",
  primary: "#0066cc",
  selection: "auto",
  surface: "#121212",
  surfaceMuted: "#181818",
  tableHeader: "#202020",
  tableRowAlt: "#242424",
  windowBackground: "#000000",
};

function createSyntaxTheme(theme: Partial<SyntaxTheme>): SyntaxTheme {
  return {
    appearance: "dark",
    background: "#000000",
    foreground: "#ffffff",
    label: "Test",
    name: "test",
    ...theme,
  };
}

describe("diffPalette", () => {
  it("derives neutral dark colors from the code theme", () => {
    expect(getDiffPalette(createSyntaxTheme({}), displayColors)).toMatchObject({
      background: "#000000",
      border: "#292929",
      danger: "#ff453a",
      fileHeaderBackground: "#1c1c1c",
      foreground: "#ffffff",
      hunkHeaderBackground: "#0e0e0e",
      muted: "#919191",
      primary: "#0066cc",
      sidebarBackground: "#090909",
      sidebarConflictBadgeBackground: "#ff453a",
      sidebarConflictBadgeText: "#ffffff",
      sidebarFolder: "#717171",
      sidebarSelectedBackground: "#001d39",
      sidebarSelectedBorder: "#0066cc",
      surface: "#0b0b0b",
      surfaceMuted: "#131313",
    });
  });

  it("derives neutral light colors from the code theme", () => {
    expect(getDiffPalette(createSyntaxTheme({
      appearance: "light",
      background: "#ffffff",
      foreground: "#000000",
    }), displayColors)).toMatchObject({
      background: "#ffffff",
      border: "#dbdbdb",
      fileHeaderBackground: "#eeeeee",
      foreground: "#000000",
      hunkHeaderBackground: "#f6f6f6",
      muted: "#808080",
      sidebarBackground: "#f9f9f9",
      sidebarFolder: "#9c9c9c",
      sidebarSelectedBackground: "#d1e3f6",
      surface: "#f6f6f6",
      surfaceMuted: "#f0f0f0",
    });
  });

  it("falls back to display neutrals when code theme colors are not hex values", () => {
    expect(getDiffPalette(createSyntaxTheme({
      background: "canvas",
      foreground: "text",
    }), displayColors)).toMatchObject({
      border: displayColors.border,
      fileHeaderBackground: displayColors.surfaceMuted,
      hunkHeaderBackground: displayColors.surface,
      muted: displayColors.muted,
      sidebarBackground: displayColors.surface,
      sidebarFolder: displayColors.muted,
      sidebarSelectedBackground: displayColors.surfaceMuted,
      surface: displayColors.surface,
      surfaceMuted: displayColors.surfaceMuted,
    });
  });
});
