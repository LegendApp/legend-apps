import { warmSyntaxHighlighters, type SyntaxHighlighterWarmupResult } from "@legend-desktop/syntax-parser";
import { getCodeSyntaxThemeSetting } from "./codeSettings";

let warmupPromise: Promise<SyntaxHighlighterWarmupResult[]> | null = null;

export function warmCodeSyntaxHighlighters(languages = ["tsx"]) {
  const syntaxTheme = getCodeSyntaxThemeSetting();
  warmupPromise ??= warmSyntaxHighlighters({
    label: "CodeViewer",
    languages,
    theme: syntaxTheme,
  }).catch((error: unknown) => {
    warmupPromise = null;
    throw error;
  });

  return warmupPromise;
}
