import { isKnownGrammar } from "./grammarDownloads";
import { treeGrammarManager } from "./treeGrammarService";
import { NitroModules } from "react-native-nitro-modules";
import { defaultSyntaxThemeName } from "./syntaxAssets";
import type { SyntaxParser } from "./SyntaxParser.nitro";
export { treeGrammarManager, ensureTreeGrammarsForPaths } from "./treeGrammarService";
export { canonicalGrammar, detectGrammar, grammarLanguageOptions, isKnownGrammar, type GrammarProgress } from "./grammarDownloads";
export { useGrammarProgress } from "./useGrammarProgress";

let syntaxParser: SyntaxParser | undefined;

function getSyntaxParser() {
  syntaxParser ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
  return syntaxParser;
}

export async function highlightString(source: string, language = "typescript", theme = defaultSyntaxThemeName) {
  if (isKnownGrammar(language)) await treeGrammarManager.ensure(language).catch(() => {});
  return getSyntaxParser().highlightTreeString(source, language, theme);
}
export function highlightTreeString(source: string, language: string, theme = defaultSyntaxThemeName) {
  return getSyntaxParser().highlightTreeString(source, language, theme);
}

export async function loadCodeFile(
  filePath: string,
  language = "typescript",
  theme = defaultSyntaxThemeName,
  initialLineCount = 200,
) {
  if (isKnownGrammar(language)) await treeGrammarManager.ensure(language).catch(() => {});
  return getSyntaxParser().loadCodeFile(filePath, language, theme, initialLineCount);
}

export {
  bundledSyntaxThemes,
  defaultSyntaxThemeName,
  ensureSyntaxTheme,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  getSyntaxAssetStorage,
  getSyntaxLanguageForPath,
  getSyntaxTheme,
  isAvailableSyntaxThemeName,
  isSyntaxThemeInstalled,
  normalizeSyntaxThemeName,
  removeSyntaxAsset,
  type BundledSyntaxThemeName,
  type SyntaxAssetEntry,
  type SyntaxAssetKind,
  type SyntaxAssetStatus,
  type SyntaxTheme,
  type SyntaxThemeAppearance,
  type SyntaxThemeAssetEntry,
} from "./syntaxAssets";
export {
  resolveSyntaxScopeStyles,
  type SyntaxScopeEntry,
} from "./syntaxThemeResolver";

export type {
  SyntaxDocument,
  SyntaxFileLoadResult,
  SyntaxHighlightResult,
  SyntaxHighlightTiming,
  SyntaxRenderLine,
  SyntaxStyle,
  SyntaxTokenRun,
} from "./SyntaxParser.nitro";
