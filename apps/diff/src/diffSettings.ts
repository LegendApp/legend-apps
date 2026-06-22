import { createObservableFile } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type DiffSettingsFile = {
  syntaxTheme: BundledSyntaxThemeName;
};

const initialDiffSettings: DiffSettingsFile = {
  syntaxTheme: defaultSyntaxThemeName,
};

const diffSettings$ = createObservableFile<DiffSettingsFile>({
  filename: "settings",
  initialValue: initialDiffSettings,
});

export function getDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = diffSettings$.syntaxTheme.get();
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialDiffSettings.syntaxTheme;
}

export function getDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getDiffSyntaxThemeSetting());
}

export function useDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = useValue(diffSettings$.syntaxTheme);
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialDiffSettings.syntaxTheme;
}

export function useDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useDiffSyntaxThemeSetting());
}

export function setDiffSyntaxThemeSetting(syntaxTheme: BundledSyntaxThemeName) {
  diffSettings$.syntaxTheme.set(syntaxTheme);
}
