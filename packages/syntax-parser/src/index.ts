import { NitroModules } from "react-native-nitro-modules";
import { defaultSyntaxThemeName } from "./syntaxAssets";
import type { SyntaxParser } from "./SyntaxParser.nitro";

let syntaxParser: SyntaxParser | undefined;

function getSyntaxParser() {
  syntaxParser ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
  return syntaxParser;
}

export function highlightString(source: string, language = "typescript", theme = defaultSyntaxThemeName) {
  return getSyntaxParser().highlightString(source, language, theme);
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
  ensureSyntaxGrammarsForPaths,
  ensureSyntaxTheme,
  getAvailableSyntaxGrammars,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  getSyntaxAssetStorage,
  getSyntaxLanguageForPath,
  getSyntaxTheme,
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
