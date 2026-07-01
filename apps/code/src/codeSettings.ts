import { createObservableSettings } from "@legend-desktop/storage";
import {
  normalizeBooleanSetting,
  normalizeSourceFontFamily,
  normalizeSourceFontSize,
  sourceFontFamilyOptions,
  sourceFontSizeOptions,
  type SourceFontFamilySetting,
} from "@legend-desktop/syntax-settings";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  normalizeSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type CodeSettingsFile = {
  fontFamily?: CodeFontFamilySetting;
  fontSize?: number;
  syntaxHighlightingEnabled?: boolean;
  syntaxPrewarmEnabled?: boolean;
  syntaxTheme: string;
};

export type CodeFontFamilySetting = SourceFontFamilySetting;

export const codeFontFamilyOptions = sourceFontFamilyOptions;
export const codeFontSizeOptions = sourceFontSizeOptions;
export const defaultCodeFontFamily: CodeFontFamilySetting = "Menlo";
export const defaultCodeFontSize = 13;
export const defaultCodeSyntaxHighlightingEnabled = true;
export const defaultCodeSyntaxPrewarmEnabled = true;

function normalizeCodeFontFamily(fontFamily: unknown): CodeFontFamilySetting {
  return normalizeSourceFontFamily(fontFamily, defaultCodeFontFamily);
}

function normalizeCodeFontSize(fontSize: unknown): number {
  return normalizeSourceFontSize(fontSize, defaultCodeFontSize);
}

const codeSettings = createObservableSettings({
  fields: {
    fontFamily: {
      defaultValue: defaultCodeFontFamily,
      normalize: normalizeCodeFontFamily,
    },
    fontSize: {
      defaultValue: defaultCodeFontSize,
      normalize: normalizeCodeFontSize,
    },
    syntaxHighlightingEnabled: {
      defaultValue: defaultCodeSyntaxHighlightingEnabled,
      normalize: (value) => normalizeBooleanSetting(value, defaultCodeSyntaxHighlightingEnabled),
    },
    syntaxPrewarmEnabled: {
      defaultValue: defaultCodeSyntaxPrewarmEnabled,
      normalize: (value) => normalizeBooleanSetting(value, defaultCodeSyntaxPrewarmEnabled),
    },
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: normalizeSyntaxThemeName,
    },
  },
  filename: "settings",
});
const fontFamilySetting = codeSettings.field("fontFamily");
const fontSizeSetting = codeSettings.field("fontSize");
const syntaxHighlightingEnabledSetting = codeSettings.field("syntaxHighlightingEnabled");
const syntaxPrewarmEnabledSetting = codeSettings.field("syntaxPrewarmEnabled");
const syntaxThemeSetting = codeSettings.field("syntaxTheme");
export const codeSettings$ = codeSettings.settings$;

export function getCodeFontFamilySetting(): CodeFontFamilySetting {
  return fontFamilySetting.get();
}

export function getCodeFontSizeSetting(): number {
  return fontSizeSetting.get();
}

export function getCodeSyntaxHighlightingEnabledSetting(): boolean {
  return syntaxHighlightingEnabledSetting.get();
}

export function getCodeSyntaxPrewarmEnabledSetting(): boolean {
  return syntaxPrewarmEnabledSetting.get();
}

export function getCodeSyntaxThemeSetting(): string {
  return syntaxThemeSetting.get();
}

export function getCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getCodeSyntaxThemeSetting());
}

export function useCodeFontFamilySetting(): CodeFontFamilySetting {
  return normalizeCodeFontFamily(useValue(codeSettings$.fontFamily));
}

export function useCodeFontSizeSetting(): number {
  return normalizeCodeFontSize(useValue(codeSettings$.fontSize));
}

export function useCodeSyntaxHighlightingEnabledSetting(): boolean {
  return normalizeBooleanSetting(useValue(codeSettings$.syntaxHighlightingEnabled), defaultCodeSyntaxHighlightingEnabled);
}

export function useCodeSyntaxPrewarmEnabledSetting(): boolean {
  return normalizeBooleanSetting(useValue(codeSettings$.syntaxPrewarmEnabled), defaultCodeSyntaxPrewarmEnabled);
}

export function useCodeSyntaxThemeSetting(): string {
  return normalizeSyntaxThemeName(useValue(codeSettings$.syntaxTheme));
}

export function useCodeSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useCodeSyntaxThemeSetting());
}

export function setCodeFontFamilySetting(fontFamily: CodeFontFamilySetting) {
  fontFamilySetting.set(fontFamily);
}

export function setCodeFontSizeSetting(fontSize: number) {
  fontSizeSetting.set(fontSize);
}

export function setCodeSyntaxHighlightingEnabledSetting(enabled: boolean) {
  syntaxHighlightingEnabledSetting.set(enabled);
}

export function setCodeSyntaxPrewarmEnabledSetting(enabled: boolean) {
  syntaxPrewarmEnabledSetting.set(enabled);
}

export function setCodeSyntaxThemeSetting(syntaxTheme: string) {
  syntaxThemeSetting.set(syntaxTheme);
}
