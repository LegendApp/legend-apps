import type { LegendThemeFile } from "./types";

export const generatedThemeFiles = [
  {
    "name": "light",
    "colors": {
      "background": "#f5f6f8",
      "foreground": "#111827",
      "muted": "#6b7280",
      "surface": "#ffffff",
      "surfaceMuted": "#f3f4f6",
      "border": "#d1d5db",
      "primary": "#2563eb",
      "danger": "#b42318",
      "selection": "#bfdbfe",
      "code": "#111827",
      "codeForeground": "#f9fafb",
      "blockquoteBackground": "#f8fafc",
      "blockquoteBorder": "#94a3b8",
      "tableHeader": "#f3f4f6",
      "tableRowAlt": "#f9fafb",
      "windowBackground": "#f5f6f8"
    }
  },
  {
    "name": "dark",
    "colors": {
      "background": "#111827",
      "foreground": "#f9fafb",
      "muted": "#9ca3af",
      "surface": "#1f2937",
      "surfaceMuted": "#243041",
      "border": "#374151",
      "primary": "#60a5fa",
      "danger": "#f87171",
      "selection": "#1d4ed8",
      "code": "#020617",
      "codeForeground": "#f8fafc",
      "blockquoteBackground": "#172033",
      "blockquoteBorder": "#64748b",
      "tableHeader": "#243041",
      "tableRowAlt": "#172033",
      "windowBackground": "#111827"
    }
  }
] satisfies LegendThemeFile[];
