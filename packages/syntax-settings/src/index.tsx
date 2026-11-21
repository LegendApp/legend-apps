import { SelectControl } from "@legend-apps/design-system";
import { SettingsRow, SettingsSection, SettingsSwitchRow, SettingsSelectRow } from "@legendapp/spark/ui/settings";
import {
  ensureSyntaxTheme,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  type SyntaxThemeAssetEntry,
} from "@legend-apps/syntax-parser";
import { useMemo, useState } from "react";
import { StyleSheet, Text } from "react-native";
import {
  sourceFontSizeOptions,
  type SourceFontFamilySetting,
} from "./values";

export * from "./values";

const sourceFontSizeSettingOptions = sourceFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

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
      <SettingsRow label="Font">
        <SelectControl
          accessibilityLabel={fontAccessibilityLabel}
          onChange={onFontFamilyChange}
          options={fontFamilyOptions}
          value={fontFamily}
        />
      </SettingsRow>
      <SettingsRow label="Font size">
        <SelectControl
          accessibilityLabel={fontSizeAccessibilityLabel}
          onChange={onFontSizeChange}
          options={fontSizeOptions}
          value={fontSize}
        />
      </SettingsRow>
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
    <SettingsSwitchRow
      label="Syntax highlighting"
      value={syntaxHighlightingEnabled}
      onValueChange={onSyntaxHighlightingChange}
    />
  );
}

export type SyntaxThemeSelectorSectionProps = {
  description?: string | null;
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
      <SettingsSelectRow
        description={themeDescription ?? undefined}
        label={rowTitle}
        options={themeOptions}
        value={selectedThemeValue}
        onValueChange={selectTheme}
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
    <SettingsSection title={title ?? "Source"}>
      <Text className="px-3 py-2 text-sm text-text-secondary">{description ?? "Choose the theme used for syntax colors in source views."}</Text>
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
