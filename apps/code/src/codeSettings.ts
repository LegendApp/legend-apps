import { createObservableSettings } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";

export type CodeSettingsFile = {
  syntaxTheme: BundledSyntaxThemeName;
};

const codeSettings = createObservableSettings({
  fields: {
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: (syntaxTheme): BundledSyntaxThemeName =>
        isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : defaultSyntaxThemeName,
    },
  },
  filename: "settings",
});
const syntaxThemeSetting = codeSettings.field("syntaxTheme");

export function getCodeSyntaxThemeSetting(): BundledSyntaxThemeName {
  return syntaxThemeSetting.get();
}

export function getCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getCodeSyntaxThemeSetting());
}

export function useCodeSyntaxThemeSetting(): BundledSyntaxThemeName {
  return syntaxThemeSetting.use();
}

export function useCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useCodeSyntaxThemeSetting());
}

export function setCodeSyntaxThemeSetting(syntaxTheme: BundledSyntaxThemeName) {
  syntaxThemeSetting.set(syntaxTheme);
}
