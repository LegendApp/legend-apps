import {
  getInstalledSyntaxLanguages,
  getWarmupLanguagesForPaths,
  warmInstalledSyntaxHighlighters,
} from "@legend-desktop/syntax-settings";
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
  return getWarmupLanguagesForPaths(paths);
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
  return warmInstalledSyntaxHighlighters({
    label: "DiffStartup",
    languages: installedLanguages,
    theme: syntaxTheme,
  });
}
