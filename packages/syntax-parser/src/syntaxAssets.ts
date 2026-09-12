import { createObservableFile, createStorage, getPersistPlugin, readTextFile } from "@legend-apps/storage";
import { detectGrammar } from "./grammarDownloads";

import darkPlusTheme from "../themes/dark-plus.json";
import githubLightTheme from "../themes/github-light.json";

export type SyntaxAssetKind = "theme";
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

type TextMateThemeFile = {
  colors?: Record<string, unknown>;
  displayName?: unknown;
  name?: unknown;
  tokenColors?: unknown;
  type?: unknown;
};

type SyntaxAssetSource = {
  filename: string;
  kind: SyntaxAssetKind;
};

type SyntaxAssetFileValue = Record<string, unknown> | null;
type SyntaxAssetFileStore = ReturnType<typeof createObservableFile<SyntaxAssetFileValue>>;

const syntaxAssetStorage = createStorage({
  root: "applicationSupport",
  subfolder: "syntax-assets",
});
const syntaxAssetFileStores = new Map<string, SyntaxAssetFileStore>();
const installedSyntaxThemeCache = new Map<string, SyntaxTheme | null>();

export const syntaxAssetFolder = {
  themes: "themes",
} as const;

export const defaultSyntaxThemeName = "dark-plus";

const seededThemeFiles = {
  "dark-plus": darkPlusTheme,
  "github-light": githubLightTheme,
} as const;

const seededSyntaxThemeNames = Object.keys(seededThemeFiles);
const devSyntaxAssetSourceRoot = process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE;

const fallbackTheme: SyntaxTheme = {
  appearance: "dark",
  background: "#1E1E1E",
  foreground: "#D4D4D4",
  label: "Dark Plus",
  name: defaultSyntaxThemeName,
};

function syntaxAssetDirectory(kind: SyntaxAssetKind) {
  return syntaxAssetFolder.themes;
}

function syntaxAssetStoreKey(kind: SyntaxAssetKind, filename: string) {
  return `${kind}:${filenameForAssetName(normalizeAssetName(filename))}`;
}

function getSyntaxAssetFileStore(kind: SyntaxAssetKind, filename: string) {
  const name = normalizeAssetName(filename);
  const normalizedFilename = filenameForAssetName(name);
  const key = syntaxAssetStoreKey(kind, normalizedFilename);
  let store = syntaxAssetFileStores.get(key);
  if (!store) {
    store = createObservableFile<SyntaxAssetFileValue>({
      filename: name,
      initialValue: null,
      saveTimeout: 0,
      subfolder: `syntax-assets/${syntaxAssetDirectory(kind)}`,
    });
    syntaxAssetFileStores.set(key, store);
  }
  return store;
}

function getSyntaxAssetFileValue(kind: SyntaxAssetKind, filename: string) {
  return getSyntaxAssetFileStore(kind, filename).peek();
}

async function setSyntaxAssetFileValue(kind: SyntaxAssetKind, filename: string, value: SyntaxAssetFileValue) {
  const store = getSyntaxAssetFileStore(kind, filename);
  store.set(value);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await getPersistPlugin(store)?.flush();
}

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

function filenameForAssetName(name: string) {
  return `${name}.json`;
}

function normalizeAssetName(value: string) {
  return value.replace(/\.json$/i, "");
}

function joinPath(...parts: string[]) {
  return parts
    .map((part, index) => index === 0 ? part.replace(/\/+$/g, "") : part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
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
  return syntaxAssetStorage;
}

export function getSyntaxAssetDirectoryUri(kind: SyntaxAssetKind) {
  return syntaxAssetStorage.directory(syntaxAssetDirectory(kind)).uri;
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

function getInstalledSyntaxTheme(filename: string): SyntaxTheme | null {
  const name = normalizeAssetName(filename);
  if (!installedSyntaxThemeCache.has(name)) {
    const value = seededSyntaxThemeNames.includes(name)
      ? seededThemeFiles[name as keyof typeof seededThemeFiles]
      : getSyntaxAssetFileValue("theme", filenameForAssetName(name));
    installedSyntaxThemeCache.set(name, parseSyntaxThemeFile(filenameForAssetName(name), value));
  }
  return installedSyntaxThemeCache.get(name) ?? null;
}

function listInstalledSyntaxThemes(): SyntaxThemeAssetEntry[] {
  const entries = seededSyntaxThemeNames.map((name): SyntaxThemeAssetEntry => {
    const filename = filenameForAssetName(name);
    const theme = getInstalledSyntaxTheme(name) ?? fallbackTheme;
    return {
      ...theme,
      filename,
      kind: "theme",
      removable: false,
      status: "seeded",
    };
  });
  for (const entry of syntaxAssetStorage.list(syntaxAssetFolder.themes, { extension: ".json" })) {
    const name = normalizeAssetName(entry.name);
    if (seededSyntaxThemeNames.includes(name) || name.endsWith("__m")) {
      continue;
    }
    const theme = getInstalledSyntaxTheme(entry.name);
    if (theme) {
      const filename = entry.name;
      entries.push({
        ...theme,
        filename,
        kind: "theme",
        removable: true,
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

export function getSyntaxTheme(name: string): SyntaxTheme {
  return getInstalledSyntaxTheme(name) ?? fallbackTheme;
}

export function getSyntaxThemeFile(name: string): unknown {
  const normalizedName = normalizeSyntaxThemeName(name);
  return seededSyntaxThemeNames.includes(normalizedName)
    ? seededThemeFiles[normalizedName as keyof typeof seededThemeFiles]
    : getSyntaxAssetFileValue("theme", filenameForAssetName(normalizedName));
}

export function isAvailableSyntaxThemeName(value: unknown): value is string {
  return typeof value === "string" && (
    popularSyntaxThemes.some((theme) => theme.name === value) || isSyntaxThemeInstalled(value)
  );
}

export function normalizeSyntaxThemeName(value: unknown) {
  return typeof value === "string" && isSyntaxThemeInstalled(value) ? value : defaultSyntaxThemeName;
}

export function isSyntaxThemeInstalled(name: string) {
  return getInstalledSyntaxTheme(name) !== null;
}

export function getSyntaxLanguageForPath(path: string) {
  return detectGrammar(path);
}

function getDevSyntaxAssetSourceCandidates({ filename, kind }: SyntaxAssetSource) {
  const sourceRoot = __DEV__ ? devSyntaxAssetSourceRoot : undefined;
  if (!sourceRoot) {
    return [];
  }

  return [joinPath(sourceRoot, "themes", filename), joinPath(sourceRoot, "tm-themes", "themes", filename)];
}

function readDevSyntaxAssetFile(source: SyntaxAssetSource) {
  for (const candidate of getDevSyntaxAssetSourceCandidates(source)) {
    const content = readTextFile(candidate);
    if (content !== undefined) {
      const value = JSON.parse(content);
      const valid = parseSyntaxThemeFile(source.filename, value);
      if (!valid) {
        throw new Error(`Invalid syntax ${source.kind} file at ${candidate}.`);
      }
      return value;
    }
  }
}

async function writeSyntaxAsset(kind: SyntaxAssetKind, filename: string, value: unknown) {
  if (!isObject(value)) {
    throw new Error(`Invalid syntax ${kind} file ${filename}.`);
  }
  await setSyntaxAssetFileValue(kind, filename, value);
  installedSyntaxThemeCache.set(normalizeAssetName(filename), parseSyntaxThemeFile(filename, value));
}

function unavailableSyntaxAssetMessage(kind: SyntaxAssetKind) {
  const label = kind;
  return __DEV__ && devSyntaxAssetSourceRoot
    ? `Syntax ${label} is not available in ${devSyntaxAssetSourceRoot}.`
    : `Syntax ${label} downloads are not configured yet.`;
}

async function installDevSyntaxAsset(kind: SyntaxAssetKind, filename: string) {
  const value = readDevSyntaxAssetFile({ filename, kind });
  if (!value) {
    throw new Error(unavailableSyntaxAssetMessage(kind));
  }
  await writeSyntaxAsset(kind, filename, value);
}

export async function ensureSyntaxTheme(name: string) {
  if (!isSyntaxThemeInstalled(name)) {
    await installDevSyntaxAsset("theme", filenameForAssetName(name));
  }
}

export async function removeSyntaxAsset(kind: SyntaxAssetKind, filename: string) {
  const name = normalizeAssetName(filename);
  if (kind === "theme" && seededSyntaxThemeNames.includes(name)) {
    return;
  }
  const normalizedFilename = filenameForAssetName(name);
  await setSyntaxAssetFileValue(kind, normalizedFilename, null);
  installedSyntaxThemeCache.set(name, null);
}

export const bundledSyntaxThemes = popularSyntaxThemes.filter((theme) => seededSyntaxThemeNames.includes(theme.name));
export type BundledSyntaxThemeName = string;
