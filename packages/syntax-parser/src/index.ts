import { NitroModules } from "react-native-nitro-modules";
import type { SyntaxParser } from "./SyntaxParser.nitro";

let syntaxParser: SyntaxParser | undefined;

function getSyntaxParser() {
  syntaxParser ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
  return syntaxParser;
}

export function highlightString(source: string, language = "typescript", theme = "github-dark") {
  return getSyntaxParser().highlightString(source, language, theme);
}

export function warmSyntaxHighlighter(language = "typescript", theme = "github-dark") {
  return getSyntaxParser().warmSyntaxHighlighter(language, theme);
}

export function loadCodeFile(
  filePath: string,
  language = "typescript",
  theme = "github-dark",
  initialLineCount = 200,
) {
  return getSyntaxParser().loadCodeFile(filePath, language, theme, initialLineCount);
}

export {
  bundledSyntaxThemes,
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
  type SyntaxThemeAppearance,
} from "./syntaxThemes";

export type {
  SyntaxDocument,
  SyntaxFileLoadResult,
  SyntaxHighlightResult,
  SyntaxHighlightTiming,
  SyntaxRenderLine,
  SyntaxStyle,
  SyntaxTokenRun,
} from "./SyntaxParser.nitro";
