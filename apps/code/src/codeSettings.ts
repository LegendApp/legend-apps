import { createObservableFile } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type CodeSettingsFile = {
  syntaxTheme: BundledSyntaxThemeName;
};

const initialCodeSettings: CodeSettingsFile = {
  syntaxTheme: defaultSyntaxThemeName,
};

const codeSettings$ = createObservableFile<CodeSettingsFile>({
  filename: "settings",
  initialValue: initialCodeSettings,
});

export function getCodeSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = codeSettings$.syntaxTheme.get();
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialCodeSettings.syntaxTheme;
}

export function getCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getCodeSyntaxThemeSetting());
}

export function useCodeSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = useValue(codeSettings$.syntaxTheme);
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialCodeSettings.syntaxTheme;
}

export function useCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useCodeSyntaxThemeSetting());
}

export function setCodeSyntaxThemeSetting(syntaxTheme: BundledSyntaxThemeName) {
  codeSettings$.syntaxTheme.set(syntaxTheme);
}
