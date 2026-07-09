import { SelectControl, SwitchControl } from "@legend-desktop/design-system";
import { SettingsRow, SettingsSection } from "@legend-desktop/settings-window";
import {
  ensureSyntaxTheme,
  getAvailableSyntaxGrammars,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  type SyntaxThemeAssetEntry,
} from "@legend-desktop/syntax-parser";
import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";

export type SourceFontFamilySetting = typeof sourceFontFamilyOptions[number]["value"];

export const sourceFontFamilyOptions = [
  { label: "Menlo", value: "Menlo" },
  { label: "SF Mono", value: "SF Mono" },
  { label: "Monaco", value: "Monaco" },
  { label: "Courier New", value: "Courier New" },
  { label: "Courier", value: "Courier" },
] as const;

export const sourceFontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

const sourceFontSizeSettingOptions = sourceFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

export function normalizeSourceFontFamily(
  fontFamily: unknown,
  defaultFontFamily: SourceFontFamilySetting,
): SourceFontFamilySetting {
  return typeof fontFamily === "string" && sourceFontFamilyOptions.some((option) => option.value === fontFamily)
    ? fontFamily as SourceFontFamilySetting
    : defaultFontFamily;
}

export function normalizeSourceFontSize(fontSize: unknown, defaultFontSize: number): number {
  return typeof fontSize === "number" && sourceFontSizeOptions.includes(fontSize as typeof sourceFontSizeOptions[number])
    ? fontSize
    : defaultFontSize;
}

export function normalizeBooleanSetting(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

export type SourceTypographySettingsRowsProps<FontFamily extends string = SourceFontFamilySetting> = {
  fontAccessibilityLabel: string;
  fontFamily: FontFamily;
  fontFamilyOptions: readonly { label: string; value: FontFamily }[];
  fontSize: number;
  fontSizeAccessibilityLabel: string;
  fontSizeOptions?: readonly { label: string; value: number }[];
  onFontFamilyChange: (fontFamily: FontFamily) => void;
  onFontSizeChange: (fontSize: number) => void;
};

export function SourceTypographySettingsRows<FontFamily extends string = SourceFontFamilySetting>({
  fontAccessibilityLabel,
  fontFamily,
  fontFamilyOptions,
  fontSize,
  fontSizeAccessibilityLabel,
  fontSizeOptions = sourceFontSizeSettingOptions,
  onFontFamilyChange,
  onFontSizeChange,
}: SourceTypographySettingsRowsProps<FontFamily>) {
  return (
    <>
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel={fontAccessibilityLabel}
            onChange={onFontFamilyChange}
            options={fontFamilyOptions}
            value={fontFamily}
          />
        )}
        title="Font"
      />
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel={fontSizeAccessibilityLabel}
            onChange={onFontSizeChange}
            options={fontSizeOptions}
            value={fontSize}
          />
        )}
        title="Font size"
      />
    </>
  );
}

export type SourceSyntaxToggleSettingsRowsProps = {
  onSyntaxHighlightingChange: (enabled: boolean) => void;
  syntaxHighlightingEnabled: boolean;
};

export function SourceSyntaxToggleSettingsRows({
  onSyntaxHighlightingChange,
  syntaxHighlightingEnabled,
}: SourceSyntaxToggleSettingsRowsProps) {
  return (
    <SettingsRow
      align="center"
      control={(
        <SwitchControl
          accessibilityLabel="Syntax highlighting"
          checked={syntaxHighlightingEnabled}
          onChange={onSyntaxHighlightingChange}
        />
      )}
      title="Syntax highlighting"
    />
  );
}

export type SyntaxThemeSelectorSectionProps = {
  description?: string | null;
  first?: boolean;
  onThemeChange: (theme: string) => void | Promise<void>;
  rowDescription?: string | null;
  rowTitle?: string;
  selectedTheme: string;
  title?: string | null;
};

function statusLabel(status: "available" | "installed" | "seeded") {
  return status === "available" ? "Download" : status === "seeded" ? "Included" : "Installed";
}

function optionLabel(theme: SyntaxThemeAssetEntry) {
  return theme.status === "available" ? `${theme.label} (${statusLabel(theme.status)})` : theme.label;
}

export function SyntaxThemeSelectorSection({
  description,
  first = false,
  onThemeChange,
  rowDescription,
  rowTitle = "Syntax Theme",
  selectedTheme,
  title,
}: SyntaxThemeSelectorSectionProps) {
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const themes = useMemo(() => getAvailableSyntaxThemes(), [version]);
  const selectedThemeEntry = themes.find((theme) => theme.name === selectedTheme);
  const selectedThemeValue = selectedThemeEntry?.name ?? themes[0]?.name ?? selectedTheme;
  const themeOptions = themes.map((theme) => ({
    label: optionLabel(theme),
    value: theme.name,
  }));
  const refresh = () => setVersion((value) => value + 1);
  const selectTheme = (themeName: string) => {
    const theme = themes.find((item) => item.name === themeName);
    const promise = theme?.status === "available"
      ? ensureSyntaxTheme(themeName).then(() => onThemeChange(themeName))
      : Promise.resolve(onThemeChange(themeName));
    promise
      .then(() => {
        setMessage(null);
        refresh();
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
        refresh();
      });
  };
  const themeDescription = rowDescription === undefined
    ? `${themes.length} themes found in ${getSyntaxAssetDirectoryUri("theme")}.`
    : rowDescription;

  const content = (
    <>
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel={rowTitle}
            onChange={selectTheme}
            options={themeOptions}
            value={selectedThemeValue}
          />
        )}
        description={themeDescription ?? undefined}
        title={rowTitle}
      />
      {message ? (
        <Text className="px-1 text-text-secondary" style={styles.message}>{message}</Text>
      ) : null}
    </>
  );

  if (!title && !description) {
    return content;
  }

  return (
    <SettingsSection
      card={false}
      contentClassName="gap-3"
      description={description ?? "Choose the TextMate theme used for syntax colors in source views."}
      first={first}
      title={title ?? "Source"}
    >
      {content}
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  message: {
    fontSize: 12,
    lineHeight: 17,
  },
});
