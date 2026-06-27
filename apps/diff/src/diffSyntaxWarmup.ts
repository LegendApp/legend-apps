import { getSyntaxLanguageForPath, isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";
import {
  getDiffSyntaxHighlightingEnabledSetting,
  getDiffSyntaxPrewarmEnabledSetting,
  getDiffSyntaxPrewarmKnownLanguagesSetting,
  getDiffSyntaxPrewarmLanguagesSetting,
  getDiffSyntaxThemeSetting,
  setDiffSyntaxPrewarmKnownLanguagesSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
} from "./diffSettings";

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

function getInstalledSyntaxLanguages(languages: readonly string[]) {
  return languages.filter((language) => isSyntaxGrammarInstalled(language));
}

export function recordDiffSyntaxLanguagesForPaths(paths: readonly string[]) {
  const pathLanguages = getDiffWarmupLanguagesForPaths(paths);
  if (pathLanguages.length > 0) {
    const knownLanguages = new Set(getDiffSyntaxPrewarmKnownLanguagesSetting());
    const enabledLanguages = new Set(getDiffSyntaxPrewarmLanguagesSetting());
    let changed = false;

    for (const language of pathLanguages) {
      if (!knownLanguages.has(language)) {
        knownLanguages.add(language);
        enabledLanguages.add(language);
        changed = true;
      }
    }

    if (changed) {
      setDiffSyntaxPrewarmKnownLanguagesSetting([...knownLanguages]);
      setDiffSyntaxPrewarmLanguagesSetting([...enabledLanguages]);
    }
  }

  return pathLanguages;
}

export function warmDiffSyntaxHighlightersForStartup() {
  if (!getDiffSyntaxHighlightingEnabledSetting() || !getDiffSyntaxPrewarmEnabledSetting()) {
    return Promise.resolve([]);
  }

  const installedLanguages = getInstalledSyntaxLanguages(getDiffSyntaxPrewarmLanguagesSetting());
  if (installedLanguages.length === 0) {
    return Promise.resolve([]);
  }

  const syntaxTheme = getDiffSyntaxThemeSetting();
  return warmSyntaxHighlighters({
    label: "DiffStartup",
    languages: installedLanguages,
    theme: syntaxTheme,
  });
}
