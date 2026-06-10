#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LegendThemeFile } from "../packages/theme/src/types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const themeDir = path.join(rootDir, "packages/theme/src/themes");
const cssPath = path.join(rootDir, "shell/src/global.css");
const generatedThemeRegistryPath = path.join(rootDir, "packages/theme/src/generatedThemes.ts");

const colorVariables = [
  "background",
  "foreground",
  "muted",
  "surface",
  "surfaceMuted",
  "border",
  "primary",
  "danger",
  "selection",
  "code",
  "codeForeground",
  "blockquoteBackground",
  "blockquoteBorder",
  "tableHeader",
  "tableRowAlt",
  "windowBackground",
] as const;

function tailwindColorName(colorName: string) {
  return `--color-${colorName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

function resolveSelectionColor(color: string) {
  return color === "auto" ? "Highlight" : color;
}

function readTheme(name: string): LegendThemeFile {
  return JSON.parse(fs.readFileSync(path.join(themeDir, `${name}.json`), "utf8")) as LegendThemeFile;
}

function readThemeNames() {
  return fs.readdirSync(themeDir)
    .filter((filename) => filename.endsWith(".json"))
    .map((filename) => filename.slice(0, -".json".length))
    .sort((a, b) => {
      if (a === "light") {
        return -1;
      }
      if (b === "light") {
        return 1;
      }
      if (a === "dark") {
        return -1;
      }
      if (b === "dark") {
        return 1;
      }
      return a.localeCompare(b);
    });
}

function validateThemes(themes: LegendThemeFile[]) {
  for (const theme of themes) {
    if (theme.name === undefined || theme.colors === undefined) {
      throw new Error(`Theme ${JSON.stringify(theme)} is missing name or colors.`);
    }

    if (theme.appearance !== undefined && theme.appearance !== "light" && theme.appearance !== "dark") {
      throw new Error(`Theme ${theme.name} has invalid appearance ${JSON.stringify(theme.appearance)}.`);
    }

    for (const colorName of colorVariables) {
      if (!theme.colors[colorName]) {
        throw new Error(`Theme ${theme.name} is missing colors.${colorName}.`);
      }
    }
  }
}

function renderThemeVariables(theme: LegendThemeFile) {
  const { colors } = theme;
  const variables = [
    ...colorVariables.map((colorName) => [
      tailwindColorName(colorName),
      colorName === "selection" ? resolveSelectionColor(colors[colorName]) : colors[colorName],
    ]),
    ["--color-background-primary", colors.background],
    ["--color-background-secondary", colors.surface],
    ["--color-background-tertiary", colors.surfaceMuted],
    ["--color-background-destructive", "#8b0000"],
    ["--color-background-inverse", colors.foreground],
    ["--color-text-primary", colors.foreground],
    ["--color-text-secondary", colors.muted],
    ["--color-text-tertiary", colors.muted],
    ["--color-accent-primary", colors.primary],
    ["--color-accent-secondary", colors.link ?? colors.primary],
    ["--color-border-primary", colors.border],
    ["--color-border-popup", colors.border],
  ]
    .map(([name, value]) => `      ${name}: ${value};`)
    .join("\n");

  return `    @variant ${theme.name} {\n${variables}\n    }`;
}

const themes = readThemeNames().map(readTheme);
const uniwindThemes = themes.filter((theme) => theme.name === "light" || theme.name === "dark");
validateThemes(themes);

if (!themes.some((theme) => theme.name === "light")) {
  throw new Error("Theme files must include light.json.");
}

const css = `@import 'tailwindcss';
@import 'uniwind';

@source "../../apps";
@source "../../packages";
@source "./";

.inset-0 {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

@layer theme {
  :root {
${uniwindThemes.map(renderThemeVariables).join("\n\n")}
  }
}
`;

fs.writeFileSync(cssPath, css);

const generatedThemeRegistry = `import type { LegendThemeFile } from "./types";

export const generatedThemeFiles = ${JSON.stringify(themes, null, 2)} satisfies LegendThemeFile[];
`;

fs.writeFileSync(generatedThemeRegistryPath, generatedThemeRegistry);

console.log(`Generated ${path.relative(rootDir, cssPath)} from ${uniwindThemes.length} UniWind theme buckets.`);
console.log(`Generated ${path.relative(rootDir, generatedThemeRegistryPath)} from ${themes.length} themes.`);
