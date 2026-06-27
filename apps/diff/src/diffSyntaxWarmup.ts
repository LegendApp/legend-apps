import { getSyntaxLanguageForPath, isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";
import { getDiffSyntaxThemeSetting } from "./diffSettings";

export function getDiffWarmupLanguagesForPaths(paths: readonly string[]) {
  const languages = new Set<string>();
  for (const path of paths) {
    const language = getSyntaxLanguageForPath(path);
    if (language && isSyntaxGrammarInstalled(language)) {
      languages.add(language);
    }
  }
  return [...languages];
}

export function warmDiffSyntaxHighlightersForPaths(paths: readonly string[]) {
  const installedLanguages = getDiffWarmupLanguagesForPaths(paths);
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
