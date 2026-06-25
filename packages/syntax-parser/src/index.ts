import { NitroModules } from "react-native-nitro-modules";
import { defaultSyntaxThemeName } from "./syntaxAssets";
import type { SyntaxHighlightTiming, SyntaxParser } from "./SyntaxParser.nitro";

let syntaxParser: SyntaxParser | undefined;
const syntaxHighlighterWarmupPromises = new Map<string, Promise<SyntaxHighlighterWarmupResult[]>>();

function getSyntaxParser() {
  syntaxParser ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
  return syntaxParser;
}

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export type SyntaxHighlighterWarmupResult = {
  language: string;
  timing: SyntaxHighlightTiming;
};

export type WarmSyntaxHighlightersOptions = {
  label?: string;
  languages: readonly string[];
  theme: string;
};

export function highlightString(source: string, language = "typescript", theme = defaultSyntaxThemeName) {
  return getSyntaxParser().highlightString(source, language, theme);
}

export function warmSyntaxHighlighter(language = "typescript", theme = defaultSyntaxThemeName) {
  return getSyntaxParser().warmSyntaxHighlighter(language, theme);
}

export function warmSyntaxHighlighters({
  label,
  languages,
  theme,
}: WarmSyntaxHighlightersOptions) {
  const key = `${theme}:${languages.join(",")}`;
  let warmupPromise = syntaxHighlighterWarmupPromises.get(key);

  if (!warmupPromise) {
    warmupPromise = languages.reduce<Promise<SyntaxHighlighterWarmupResult[]>>(
      (promise, language) => promise.then((results) => (
        warmSyntaxHighlighter(language, theme).then((timing) => [...results, { language, timing }])
      )),
      Promise.resolve([]),
    ).catch((error: unknown) => {
      syntaxHighlighterWarmupPromises.delete(key);
      throw error;
    });
    syntaxHighlighterWarmupPromises.set(key, warmupPromise);
  }

  if (label) {
    return warmupPromise.then((results) => {
      console.info(
        results
          .map(({ language, timing }) => (
            `[${label}] warm ${language} total=${formatMs(timing.totalMs)} context=${formatMs(timing.contextMs)} tokenize=${formatMs(timing.tokenizeMs)}`
          ))
          .join(" "),
      );
      return results;
    });
  }

  return warmupPromise;
}

export function loadCodeFile(
  filePath: string,
  language = "typescript",
  theme = defaultSyntaxThemeName,
  initialLineCount = 200,
) {
  return getSyntaxParser().loadCodeFile(filePath, language, theme, initialLineCount);
}

export {
  bundledSyntaxThemes,
  defaultSyntaxThemeName,
  ensureSyntaxGrammar,
  ensureSyntaxTheme,
  getAvailableSyntaxGrammars,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  getSyntaxAssetStorage,
  getSyntaxTheme,
  initializeSyntaxAssetsSync,
  isAvailableSyntaxThemeName,
  isSyntaxGrammarInstalled,
  isSyntaxThemeInstalled,
  normalizeSyntaxThemeName,
  removeSyntaxAsset,
  type BundledSyntaxThemeName,
  type SyntaxAssetEntry,
  type SyntaxAssetKind,
  type SyntaxAssetStatus,
  type SyntaxGrammarAssetEntry,
  type SyntaxTheme,
  type SyntaxThemeAppearance,
  type SyntaxThemeAssetEntry,
} from "./syntaxAssets";

export type {
  SyntaxDocument,
  SyntaxFileLoadResult,
  SyntaxHighlightResult,
  SyntaxHighlightTiming,
  SyntaxRenderLine,
  SyntaxStyle,
  SyntaxTokenRun,
} from "./SyntaxParser.nitro";
