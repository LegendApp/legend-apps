import { SelectControl } from "@legend-desktop/design-system";
import { SettingsRow, SettingsSection } from "@legend-desktop/settings-window";
import {
  ensureSyntaxGrammar,
  ensureSyntaxTheme,
  getAvailableSyntaxGrammars,
  getAvailableSyntaxThemes,
  getSyntaxAssetDirectoryUri,
  removeSyntaxAsset,
  type SyntaxGrammarAssetEntry,
  type SyntaxThemeAssetEntry,
} from "@legend-desktop/syntax-parser";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
  return `${theme.label} (${statusLabel(theme.status)})`;
}

function ActionButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="h-8 justify-center rounded-md border border-border bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted"
      disabled={disabled}
      onPress={onPress}
      style={disabled ? styles.disabled : null}
    >
      <Text className="text-foreground" style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function GrammarControls({
  grammar,
  onChange,
  onMessage,
}: {
  grammar: SyntaxGrammarAssetEntry;
  onChange: () => void;
  onMessage: (message: string | null) => void;
}) {
  const install = () => {
    ensureSyntaxGrammar(grammar.name)
      .then(() => {
        onMessage(null);
        onChange();
      })
      .catch((error: unknown) => {
        onMessage(error instanceof Error ? error.message : String(error));
      });
  };
  const remove = () => {
    removeSyntaxAsset("grammar", grammar.filename);
    onMessage(null);
    onChange();
  };

  if (grammar.status === "available") {
    return <ActionButton label="Download" onPress={install} />;
  }

  return (
    <ActionButton
      disabled={!grammar.removable}
      label={grammar.removable ? "Remove" : "Installed"}
      onPress={remove}
    />
  );
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
  const grammars = useMemo(() => getAvailableSyntaxGrammars(), [version]);
  const selectedThemeEntry = themes.find((theme) => theme.name === selectedTheme);
  const selectedThemeValue = selectedThemeEntry?.name ?? themes[0]?.name ?? selectedTheme;
  const themeOptions = themes.map((theme) => ({
    label: optionLabel(theme),
    value: theme.name,
  }));
  const installedGrammarCount = grammars.filter((grammar) => grammar.status !== "available").length;
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
  const grammarDescription = `${installedGrammarCount} installed, ${grammars.length - installedGrammarCount} available.`;

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
      <SettingsRow
        align="start"
        control={(
          <View className="min-w-56 flex-col gap-2">
            {grammars.map((grammar) => (
              <View className="flex-row items-center justify-between gap-3" key={grammar.filename}>
                <View className="min-w-0 flex-1">
                  <Text className="text-foreground" numberOfLines={1} style={styles.grammarLabel}>
                    {grammar.label}
                  </Text>
                  <Text className="text-text-secondary" numberOfLines={1} style={styles.grammarStatus}>
                    {statusLabel(grammar.status)}
                  </Text>
                </View>
                <GrammarControls
                  grammar={grammar}
                  onChange={refresh}
                  onMessage={setMessage}
                />
              </View>
            ))}
          </View>
        )}
        description={grammarDescription}
        title="Grammars"
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
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.55,
  },
  grammarLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  grammarStatus: {
    fontSize: 11,
  },
  message: {
    fontSize: 12,
    lineHeight: 17,
  },
});
