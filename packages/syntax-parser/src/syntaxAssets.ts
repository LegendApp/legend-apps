import { createStorage } from "@legend-desktop/storage";

import githubDarkDimmedTheme from "../vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes/github-dark-dimmed.json";
import githubLightTheme from "../vendor/TextMateLib/thirdparty/textmate-grammars-themes/packages/tm-themes/themes/github-light.json";

export type SyntaxAssetKind = "grammar" | "theme";
export type SyntaxAssetStatus = "available" | "installed" | "seeded";
export type SyntaxThemeAppearance = "dark" | "light";

export type SyntaxTheme = {
  appearance: SyntaxThemeAppearance;
  background: string;
  foreground: string;
  label: string;
  name: string;
};

export type SyntaxAssetEntry = {
  filename: string;
  kind: SyntaxAssetKind;
  label: string;
  name: string;
  removable: boolean;
  status: SyntaxAssetStatus;
};

export type SyntaxThemeAssetEntry = SyntaxAssetEntry & SyntaxTheme & {
  kind: "theme";
};

export type SyntaxGrammarAssetEntry = SyntaxAssetEntry & {
  dependencies: string[];
  kind: "grammar";
  scopeName?: string;
};

type TextMateThemeFile = {
  colors?: Record<string, unknown>;
  displayName?: unknown;
  name?: unknown;
  tokenColors?: unknown;
  type?: unknown;
};

type TextMateGrammarFile = {
  displayName?: unknown;
  name?: unknown;
  patterns?: unknown;
  scopeName?: unknown;
};

const syntaxAssetStorage = createStorage({
  root: "applicationSupport",
  subfolder: "syntax-assets",
});

export const syntaxAssetFolder = {
  grammars: "grammars",
  themes: "themes",
} as const;

export const defaultSyntaxThemeName = "github-dark-dimmed";

const seededThemeFiles = {
  "github-dark-dimmed": githubDarkDimmedTheme,
  "github-light": githubLightTheme,
} as const;

const seededSyntaxThemeNames = Object.keys(seededThemeFiles);

const fallbackTheme: SyntaxTheme = {
  appearance: "dark",
  background: "#22272e",
  foreground: "#adbac7",
  label: "GitHub Dark Dimmed",
  name: defaultSyntaxThemeName,
};

export const popularSyntaxThemes = [
  { name: "github-dark-dimmed", label: "GitHub Dark Dimmed", appearance: "dark", background: "#22272e", foreground: "#adbac7" },
  { name: "github-light", label: "GitHub Light", appearance: "light", background: "#fff", foreground: "#24292e" },
  { name: "dark-plus", label: "Dark Plus", appearance: "dark", background: "#1E1E1E", foreground: "#D4D4D4" },
  { name: "light-plus", label: "Light Plus", appearance: "light", background: "#FFFFFF", foreground: "#000000" },
  { name: "catppuccin-mocha", label: "Catppuccin Mocha", appearance: "dark", background: "#1e1e2e", foreground: "#cdd6f4" },
  { name: "catppuccin-latte", label: "Catppuccin Latte", appearance: "light", background: "#eff1f5", foreground: "#4c4f69" },
  { name: "dracula", label: "Dracula Theme", appearance: "dark", background: "#282A36", foreground: "#F8F8F2" },
  { name: "one-dark-pro", label: "One Dark Pro", appearance: "dark", background: "#282c34", foreground: "#abb2bf" },
  { name: "one-light", label: "One Light", appearance: "light", background: "#FAFAFA", foreground: "#383A42" },
  { name: "tokyo-night", label: "Tokyo Night", appearance: "dark", background: "#1a1b26", foreground: "#a9b1d6" },
  { name: "vitesse-dark", label: "Vitesse Dark", appearance: "dark", background: "#121212", foreground: "#dbd7caee" },
  { name: "vitesse-light", label: "Vitesse Light", appearance: "light", background: "#ffffff", foreground: "#393a34" },
  { name: "monokai", label: "Monokai", appearance: "dark", background: "#272822", foreground: "#f8f8f2" },
  { name: "nord", label: "Nord", appearance: "dark", background: "#2e3440", foreground: "#d8dee9" },
  { name: "rose-pine", label: "Rose Pine", appearance: "dark", background: "#191724", foreground: "#e0def4" },
] as const satisfies readonly SyntaxTheme[];

export const popularSyntaxGrammars = [
  { name: "tsx", label: "TSX", filename: "tsx.json", dependencies: ["javascript.json", "typescript.json", "jsx.json", "tsx.json"] },
  { name: "typescript", label: "TypeScript", filename: "typescript.json", dependencies: ["javascript.json", "typescript.json"] },
  { name: "javascript", label: "JavaScript", filename: "javascript.json", dependencies: ["javascript.json"] },
  { name: "jsx", label: "JSX", filename: "jsx.json", dependencies: ["javascript.json", "jsx.json"] },
  { name: "json", label: "JSON", filename: "json.json", dependencies: ["json.json"] },
  { name: "markdown", label: "Markdown", filename: "markdown.json", dependencies: ["markdown.json"] },
  { name: "yaml", label: "YAML", filename: "yaml.json", dependencies: ["yaml.json"] },
  { name: "css", label: "CSS", filename: "css.json", dependencies: ["css.json"] },
  { name: "html", label: "HTML", filename: "html.json", dependencies: ["html.json"] },
  { name: "shellscript", label: "Shell", filename: "shellscript.json", dependencies: ["shellscript.json"] },
  { name: "python", label: "Python", filename: "python.json", dependencies: ["python.json"] },
  { name: "go", label: "Go", filename: "go.json", dependencies: ["go.json"] },
  { name: "rust", label: "Rust", filename: "rust.json", dependencies: ["rust.json"] },
  { name: "swift", label: "Swift", filename: "swift.json", dependencies: ["swift.json"] },
  { name: "cpp", label: "C++", filename: "cpp.json", dependencies: ["cpp.json"] },
] as const;

function filenameForAssetName(name: string) {
  return `${name}.json`;
}

function normalizeAssetName(value: string) {
  return value.replace(/\.json$/i, "");
}

function labelFromAssetName(name: string) {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value);
}

function appearanceFromBackground(background: string): SyntaxThemeAppearance {
  const hex = background.replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((digit) => `${digit}${digit}`).join("")
    : hex.slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return luminance < 140 ? "dark" : "light";
}

export function getSyntaxAssetStorage() {
  initializeSyntaxAssetsSync();
  return syntaxAssetStorage;
}

export function getSyntaxAssetDirectoryUri(kind: SyntaxAssetKind) {
  initializeSyntaxAssetsSync();
  return syntaxAssetStorage.directory(kind === "grammar" ? syntaxAssetFolder.grammars : syntaxAssetFolder.themes).uri;
}

export function initializeSyntaxAssetsSync() {
  syntaxAssetStorage.ensureDirectory(syntaxAssetFolder.grammars);
  syntaxAssetStorage.ensureDirectory(syntaxAssetFolder.themes);

  for (const name of seededSyntaxThemeNames) {
    const filename = filenameForAssetName(name);
    const relativePath = `${syntaxAssetFolder.themes}/${filename}`;
    if (!syntaxAssetStorage.file(relativePath).exists) {
      syntaxAssetStorage.write(relativePath, seededThemeFiles[name as keyof typeof seededThemeFiles], { format: "json" });
    }
  }
}

export function parseSyntaxThemeFile(filename: string, value: unknown): SyntaxTheme | null {
  if (!isObject(value)) {
    return null;
  }

  const theme = value as TextMateThemeFile;
  const colors = isObject(theme.colors) ? theme.colors : {};
  const background = isHexColor(colors["editor.background"]) ? colors["editor.background"] : null;
  const foreground = isHexColor(colors["editor.foreground"]) ? colors["editor.foreground"] : null;
  const tokenColors = Array.isArray(theme.tokenColors) ? theme.tokenColors : null;
  if (!background || !foreground || !tokenColors) {
    return null;
  }

  const name = normalizeAssetName(filename);
  const label = asString(theme.displayName) ?? labelFromAssetName(name);
  const type = theme.type === "light" || theme.type === "dark" ? theme.type : appearanceFromBackground(background);
  return { appearance: type, background, foreground, label, name };
}

export function parseSyntaxGrammarFile(filename: string, value: unknown): { label: string; name: string; scopeName: string } | null {
  if (!isObject(value)) {
    return null;
  }

  const grammar = value as TextMateGrammarFile;
  const scopeName = asString(grammar.scopeName);
  const patterns = Array.isArray(grammar.patterns) ? grammar.patterns : null;
  if (!scopeName || !patterns) {
    return null;
  }

  const name = normalizeAssetName(filename);
  const label = asString(grammar.displayName) ?? labelFromAssetName(name);
  return { label, name, scopeName };
}

function listInstalledSyntaxThemes(): SyntaxThemeAssetEntry[] {
  initializeSyntaxAssetsSync();
  const entries: SyntaxThemeAssetEntry[] = [];
  for (const entry of syntaxAssetStorage.list(syntaxAssetFolder.themes, { extension: ".json" })) {
    const parsed = syntaxAssetStorage.read(`${syntaxAssetFolder.themes}/${entry.name}`, { format: "json" });
    const theme = parseSyntaxThemeFile(entry.name, parsed);
    if (theme) {
      const filename = entry.name;
      const seeded = seededSyntaxThemeNames.includes(theme.name);
      entries.push({
        ...theme,
        filename,
        kind: "theme",
        removable: !seeded,
        status: seeded ? "seeded" : "installed",
      });
    }
  }
  return entries;
}

function listInstalledSyntaxGrammars(): SyntaxGrammarAssetEntry[] {
  initializeSyntaxAssetsSync();
  const catalogByFilename = new Map<string, typeof popularSyntaxGrammars[number]>(
    popularSyntaxGrammars.map((grammar) => [grammar.filename, grammar]),
  );
  const entries: SyntaxGrammarAssetEntry[] = [];
  for (const entry of syntaxAssetStorage.list(syntaxAssetFolder.grammars, { extension: ".json" })) {
    const parsed = syntaxAssetStorage.read(`${syntaxAssetFolder.grammars}/${entry.name}`, { format: "json" });
    const grammar = parseSyntaxGrammarFile(entry.name, parsed);
    if (grammar) {
      const catalogEntry = catalogByFilename.get(entry.name);
      entries.push({
        dependencies: catalogEntry ? [...catalogEntry.dependencies] : [entry.name],
        filename: entry.name,
        kind: "grammar",
        label: catalogEntry?.label ?? grammar.label,
        name: catalogEntry?.name ?? grammar.name,
        removable: true,
        scopeName: grammar.scopeName,
        status: "installed",
      });
    }
  }
  return entries;
}

export function getAvailableSyntaxThemes(): SyntaxThemeAssetEntry[] {
  const installed = listInstalledSyntaxThemes();
  const byName = new Map(installed.map((theme) => [theme.name, theme]));

  for (const theme of popularSyntaxThemes) {
    if (!byName.has(theme.name)) {
      byName.set(theme.name, {
        ...theme,
        filename: filenameForAssetName(theme.name),
        kind: "theme",
        removable: false,
        status: "available",
      });
    }
  }

  return [...byName.values()].sort((a, b) => (
    a.status === b.status
      ? a.label.localeCompare(b.label)
      : a.status === "available" ? 1 : -1
  ));
}

export function getAvailableSyntaxGrammars(): SyntaxGrammarAssetEntry[] {
  const installed = listInstalledSyntaxGrammars();
  const installedFilenames = new Set(installed.map((grammar) => grammar.filename));
  const entries = [...installed];

  for (const grammar of popularSyntaxGrammars) {
    if (!installedFilenames.has(grammar.filename)) {
      entries.push({
        dependencies: [...grammar.dependencies],
        filename: grammar.filename,
        kind: "grammar",
        label: grammar.label,
        name: grammar.name,
        removable: false,
        status: "available",
      });
    }
  }

  return entries.sort((a, b) => (
    a.status === b.status
      ? a.label.localeCompare(b.label)
      : a.status === "available" ? 1 : -1
  ));
}

export function getSyntaxTheme(name: string): SyntaxTheme {
  return getAvailableSyntaxThemes().find((theme) => theme.name === name)
    ?? popularSyntaxThemes.find((theme) => theme.name === name)
    ?? fallbackTheme;
}

export function isAvailableSyntaxThemeName(value: unknown): value is string {
  return typeof value === "string" && getAvailableSyntaxThemes().some((theme) => theme.name === value);
}

export function normalizeSyntaxThemeName(value: unknown) {
  return typeof value === "string" && isSyntaxThemeInstalled(value) ? value : defaultSyntaxThemeName;
}

export function isSyntaxThemeInstalled(name: string) {
  return getAvailableSyntaxThemes().some((theme) => theme.name === name && theme.status !== "available");
}

export function isSyntaxGrammarInstalled(language: string) {
  const normalized = normalizeAssetName(language);
  const installedFiles = new Set(listInstalledSyntaxGrammars().map((grammar) => grammar.filename));
  const catalogEntry = popularSyntaxGrammars.find((grammar) => grammar.name === normalized);
  const dependencies = catalogEntry?.dependencies ?? [filenameForAssetName(normalized)];
  return dependencies.every((filename) => installedFiles.has(filename));
}

export async function ensureSyntaxTheme(name: string) {
  initializeSyntaxAssetsSync();
  if (!isSyntaxThemeInstalled(name)) {
    throw new Error("Syntax theme downloads are not configured yet.");
  }
}

export async function ensureSyntaxGrammar(language: string) {
  initializeSyntaxAssetsSync();
  if (!isSyntaxGrammarInstalled(language)) {
    throw new Error("Syntax grammar downloads are not configured yet.");
  }
}

export function removeSyntaxAsset(kind: SyntaxAssetKind, filename: string) {
  initializeSyntaxAssetsSync();
  const directory = kind === "grammar" ? syntaxAssetFolder.grammars : syntaxAssetFolder.themes;
  const name = normalizeAssetName(filename);
  if (kind === "theme" && seededSyntaxThemeNames.includes(name)) {
    return;
  }
  syntaxAssetStorage.delete(`${directory}/${filenameForAssetName(name)}`);
}

export const bundledSyntaxThemes = popularSyntaxThemes.filter((theme) => seededSyntaxThemeNames.includes(theme.name));
export type BundledSyntaxThemeName = string;
