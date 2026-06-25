import { isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";
import { getDiffSyntaxThemeSetting } from "./diffSettings";

const defaultDiffWarmupLanguages = [
  "tsx",
  "typescript",
  "javascript",
  "json",
  "yaml",
];

export function warmDiffSyntaxHighlighters(languages = defaultDiffWarmupLanguages) {
  const installedLanguages = languages.filter(isSyntaxGrammarInstalled);
  if (installedLanguages.length === 0) {
    return Promise.resolve([]);
  }

  const syntaxTheme = getDiffSyntaxThemeSetting();
  return warmSyntaxHighlighters({
    label: "DiffViewer",
    languages: installedLanguages,
    theme: syntaxTheme,
  });
}
