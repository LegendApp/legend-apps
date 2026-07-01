import { warmInstalledSyntaxHighlighters, type SyntaxHighlighterWarmupResult } from "@legend-desktop/syntax-settings";
import { getCodeSyntaxPrewarmEnabledSetting, getCodeSyntaxThemeSetting } from "./codeSettings";

let warmupPromise: Promise<SyntaxHighlighterWarmupResult[]> | null = null;

export function warmCodeSyntaxHighlighters(languages = ["tsx", "typescript"]) {
  if (!getCodeSyntaxPrewarmEnabledSetting()) {
    return Promise.resolve([]);
  }

  const syntaxTheme = getCodeSyntaxThemeSetting();
  warmupPromise ??= warmInstalledSyntaxHighlighters({
    label: "CodeViewer",
    languages,
    theme: syntaxTheme,
  }).catch((error: unknown) => {
    warmupPromise = null;
    throw error;
  });

  return warmupPromise;
}
