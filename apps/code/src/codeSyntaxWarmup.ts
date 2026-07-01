import {
  isSyntaxGrammarInstalled,
  warmSyntaxHighlighters,
  type SyntaxHighlighterWarmupResult,
} from "@legend-desktop/syntax-parser";
import { getCodeSyntaxPrewarmEnabledSetting, getCodeSyntaxThemeSetting } from "./codeSettings";

let warmupPromise: Promise<SyntaxHighlighterWarmupResult[]> | null = null;

export function warmCodeSyntaxHighlighters(languages = ["tsx", "typescript"]) {
  if (!getCodeSyntaxPrewarmEnabledSetting()) {
    return Promise.resolve([]);
  }

  const installedLanguages = languages.filter(isSyntaxGrammarInstalled);
  if (installedLanguages.length === 0) {
    return Promise.resolve([]);
  }

  const syntaxTheme = getCodeSyntaxThemeSetting();
  warmupPromise ??= warmSyntaxHighlighters({
    label: "CodeViewer",
    languages: installedLanguages,
    theme: syntaxTheme,
  }).catch((error: unknown) => {
    warmupPromise = null;
    throw error;
  });

  return warmupPromise;
}
