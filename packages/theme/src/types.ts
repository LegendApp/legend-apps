import type { MarkdownDocumentTheme } from "@legend-desktop/markdown-document";
import type { MarkdownStyle } from "react-native-enriched-markdown";

export type LegendThemeName = "light" | "dark" | (string & {});

export type LegendThemeColors = {
  background: string;
  foreground: string;
  muted: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  primary: string;
  link?: string;
  danger: string;
  selection: string;
  code: string;
  codeForeground: string;
  inlineCodeBackground?: string;
  inlineCodeForeground?: string;
  blockquoteBackground: string;
  blockquoteBorder: string;
  tableHeader: string;
  tableRowAlt: string;
  windowBackground: string;
};

export type LegendThemeFile = {
  name: LegendThemeName;
  colors: LegendThemeColors;
};

export type LegendTheme = LegendThemeFile & {
  markdownDocument: MarkdownDocumentTheme;
  markdownStyle: MarkdownStyle;
};
