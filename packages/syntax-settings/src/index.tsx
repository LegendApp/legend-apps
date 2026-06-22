import { SelectControl } from "@legend-desktop/design-system";
import { SettingsRow, SettingsSection } from "@legend-desktop/settings-window";
import {
  bundledSyntaxThemes,
  type BundledSyntaxThemeName,
} from "@legend-desktop/syntax-parser";

export type SyntaxThemeSelectorSectionProps = {
  description?: string;
  first?: boolean;
  onThemeChange: (theme: BundledSyntaxThemeName) => void;
  rowDescription?: string;
  rowTitle?: string;
  selectedTheme: BundledSyntaxThemeName;
  title?: string;
};

export const syntaxThemeOptions = bundledSyntaxThemes.map((theme) => ({
  label: theme.label,
  value: theme.name,
}));

export function SyntaxThemeSelectorSection({
  description = "Choose the TextMate theme used for syntax colors in source views.",
  first = false,
  onThemeChange,
  rowDescription = `${bundledSyntaxThemes.length} bundled Shiki themes are available.`,
  rowTitle = "Syntax Theme",
  selectedTheme,
  title = "Source",
}: SyntaxThemeSelectorSectionProps) {
  return (
    <SettingsSection
      card={false}
      contentClassName="gap-3"
      description={description}
      first={first}
      title={title}
    >
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel={rowTitle}
            onChange={onThemeChange}
            options={syntaxThemeOptions}
            value={selectedTheme}
          />
        )}
        description={rowDescription}
        title={rowTitle}
      />
    </SettingsSection>
  );
}
