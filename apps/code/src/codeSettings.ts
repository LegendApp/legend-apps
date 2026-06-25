import { createObservableSettings } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  normalizeSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";

export type CodeSettingsFile = {
  syntaxTheme: string;
};

const codeSettings = createObservableSettings({
  fields: {
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: normalizeSyntaxThemeName,
    },
  },
  filename: "settings",
});
const syntaxThemeSetting = codeSettings.field("syntaxTheme");

export function getCodeSyntaxThemeSetting(): string {
  return syntaxThemeSetting.get();
}

export function getCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getCodeSyntaxThemeSetting());
}

export function useCodeSyntaxThemeSetting(): string {
  return syntaxThemeSetting.use();
}

export function useCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useCodeSyntaxThemeSetting());
}

export function setCodeSyntaxThemeSetting(syntaxTheme: string) {
  syntaxThemeSetting.set(syntaxTheme);
}
