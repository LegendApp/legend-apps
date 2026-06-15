#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LegendDisplayThemeFile, MarkdownLayoutThemeFile } from "../packages/theme/src/types";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const displayThemeDir = path.join(rootDir, "packages/theme/src/themes/display");
const layoutThemeDir = path.join(rootDir, "packages/theme/src/themes/layout");
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

function readDisplayTheme(name: string): LegendDisplayThemeFile {
  return JSON.parse(fs.readFileSync(path.join(displayThemeDir, `${name}.json`), "utf8")) as LegendDisplayThemeFile;
}

function readLayoutTheme(name: string): MarkdownLayoutThemeFile {
  return JSON.parse(fs.readFileSync(path.join(layoutThemeDir, `${name}.json`), "utf8")) as MarkdownLayoutThemeFile;
}

function readThemeNames(themeDir: string) {
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
      if (a === "default") {
        return -1;
      }
      if (b === "default") {
        return 1;
      }
      return a.localeCompare(b);
    });
}

function validateDisplayThemes(themes: LegendDisplayThemeFile[]) {
  for (const theme of themes) {
    if (theme.name === undefined || theme.colors === undefined) {
      throw new Error(`Display theme ${JSON.stringify(theme)} is missing name or colors.`);
    }

    if (theme.appearance !== undefined && theme.appearance !== "light" && theme.appearance !== "dark") {
      throw new Error(`Display theme ${theme.name} has invalid appearance ${JSON.stringify(theme.appearance)}.`);
    }

    for (const colorName of colorVariables) {
      if (!theme.colors[colorName]) {
        throw new Error(`Display theme ${theme.name} is missing colors.${colorName}.`);
      }
    }
  }
}

function isNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateLayoutThemes(themes: MarkdownLayoutThemeFile[]) {
  for (const theme of themes) {
    if (!theme.name) {
      throw new Error(`Layout theme ${JSON.stringify(theme)} is missing name.`);
    }

    if (!theme.content || !isNumber(theme.content.horizontalPadding) || !isNumber(theme.content.maxWidth) || !isNumber(theme.content.verticalPadding)) {
      throw new Error(`Layout theme ${theme.name} has invalid content metrics.`);
    }

    if (
      !theme.typography ||
      !isNumber(theme.typography.bodyFontSize) ||
      !isNumber(theme.typography.lineHeightScale) ||
      !isNumber(theme.typography.headingLineHeightScale) ||
      !isNumber(theme.typography.codeFontSizeOffset) ||
      typeof theme.typography.codeFontFamily !== "string" ||
      typeof theme.typography.headingWeight !== "string"
    ) {
      throw new Error(`Layout theme ${theme.name} has invalid typography.`);
    }

    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      if (!isNumber(theme.typography.headingScale[level])) {
        throw new Error(`Layout theme ${theme.name} is missing typography.headingScale.${level}.`);
      }
    }

    if (!theme.spacing || !theme.spacing.heading || !theme.blocks) {
      throw new Error(`Layout theme ${theme.name} is missing spacing or block metrics.`);
    }
  }
}

function renderThemeVariables(theme: LegendDisplayThemeFile) {
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

const displayThemes = readThemeNames(displayThemeDir).map(readDisplayTheme);
const layoutThemes = readThemeNames(layoutThemeDir).map(readLayoutTheme);
const uniwindThemes = displayThemes.filter((theme) => theme.name === "light" || theme.name === "dark");
validateDisplayThemes(displayThemes);
validateLayoutThemes(layoutThemes);

if (!displayThemes.some((theme) => theme.name === "light")) {
  throw new Error("Display theme files must include light.json.");
}

if (!layoutThemes.some((theme) => theme.name === "default")) {
  throw new Error("Layout theme files must include default.json.");
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

const generatedThemeRegistry = `import type { LegendDisplayThemeFile, MarkdownLayoutThemeFile } from "./types";

export const generatedDisplayThemeFiles = ${JSON.stringify(displayThemes, null, 2)} satisfies LegendDisplayThemeFile[];

export const generatedMarkdownLayoutThemeFiles = ${JSON.stringify(layoutThemes, null, 2)} satisfies MarkdownLayoutThemeFile[];

export const generatedThemeFiles = generatedDisplayThemeFiles;
`;

fs.writeFileSync(generatedThemeRegistryPath, generatedThemeRegistry);

console.log(`Generated ${path.relative(rootDir, cssPath)} from ${uniwindThemes.length} UniWind theme buckets.`);
console.log(`Generated ${path.relative(rootDir, generatedThemeRegistryPath)} from ${displayThemes.length} display themes and ${layoutThemes.length} layout themes.`);
