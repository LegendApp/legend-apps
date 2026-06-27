import { SelectControl, SwitchControl } from "@legend-desktop/design-system";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { diffSettingsWindowIdentifier } from "./appConstants";
import { getDiffCliInstallStatus, installDiffCli, type DiffCliInstallStatus } from "./diffCli";
import {
  diffFontFamilyOptions,
  diffFontSizeOptions,
  diffRowRendererOptions,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffRowRendererSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxPrewarmEnabledSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxThemeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffRowRendererSetting,
  useDiffSyntaxHighlightingEnabledSetting,
  useDiffSyntaxPrewarmEnabledSetting,
  useDiffSyntaxPrewarmKnownLanguagesSetting,
  useDiffSyntaxPrewarmLanguagesSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance" | "syntax" | "commandLine";

const diffFontSizeSettingOptions = diffFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

function AppearanceSettingsPage() {
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const rowRenderer = useDiffRowRendererSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <SettingsPage>
      <SettingsSection
        first
        title={null}
      >
        <SettingsRow
          align="center"
          control={(
            <SelectControl
              accessibilityLabel="Diff font"
              onChange={setDiffFontFamilySetting}
              options={diffFontFamilyOptions}
              value={fontFamily}
            />
          )}
          title="Font"
        />
        <SettingsRow
          align="center"
          control={(
            <SelectControl
              accessibilityLabel="Diff font size"
              onChange={setDiffFontSizeSetting}
              options={diffFontSizeSettingOptions}
              value={fontSize}
            />
          )}
          title="Font size"
        />
        <SyntaxThemeSelectorSection
          description={null}
          onThemeChange={setDiffSyntaxThemeSetting}
          rowDescription={null}
          selectedTheme={selectedSyntaxTheme}
          title={null}
        />
        <SettingsRow
          align="center"
          control={(
            <SelectControl
              accessibilityLabel="Diff row renderer"
              onChange={setDiffRowRendererSetting}
              options={diffRowRendererOptions}
              value={rowRenderer}
            />
          )}
          description="Experimental. Restart the app before measuring memory."
          title="Row renderer"
        />
      </SettingsSection>
    </SettingsPage>
  );
}

function getSyntaxLanguageLabel(language: string) {
  if (language === "tsx") {
    return "TSX";
  }
  if (language === "typescript") {
    return "TypeScript";
  }
  if (language === "javascript") {
    return "JavaScript";
  }
  if (language === "json") {
    return "JSON";
  }
  return language.slice(0, 1).toUpperCase() + language.slice(1);
}

function SyntaxSettingsPage() {
  const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();
  const syntaxPrewarmEnabled = useDiffSyntaxPrewarmEnabledSetting();
  const knownLanguages = useDiffSyntaxPrewarmKnownLanguagesSetting();
  const prewarmLanguages = useDiffSyntaxPrewarmLanguagesSetting();
  const prewarmLanguageSet = new Set(prewarmLanguages);

  const handleLanguageToggle = (language: string, enabled: boolean) => {
    const nextLanguages = new Set(prewarmLanguages);
    if (enabled) {
      nextLanguages.add(language);
    } else {
      nextLanguages.delete(language);
    }
    setDiffSyntaxPrewarmLanguagesSetting([...nextLanguages]);
  };

  return (
    <SettingsPage>
      <SettingsSection
        first
        title={null}
      >
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Syntax highlighting"
              checked={syntaxHighlightingEnabled}
              onChange={setDiffSyntaxHighlightingEnabledSetting}
            />
          )}
          title="Syntax highlighting"
        />
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Prewarm highlighters"
              checked={syntaxPrewarmEnabled}
              disabled={!syntaxHighlightingEnabled}
              onChange={setDiffSyntaxPrewarmEnabledSetting}
            />
          )}
          disabled={!syntaxHighlightingEnabled}
          title="Prewarm highlighters"
        />
      </SettingsSection>
      <SettingsSection title="Prewarm languages">
        {knownLanguages.length > 0 ? knownLanguages.map((language) => (
          <SettingsRow
            align="center"
            control={(
              <SwitchControl
                accessibilityLabel={`Prewarm ${getSyntaxLanguageLabel(language)}`}
                checked={prewarmLanguageSet.has(language)}
                disabled={!syntaxHighlightingEnabled || !syntaxPrewarmEnabled}
                onChange={(enabled) => handleLanguageToggle(language, enabled)}
              />
            )}
            disabled={!syntaxHighlightingEnabled || !syntaxPrewarmEnabled}
            key={language}
            title={getSyntaxLanguageLabel(language)}
          />
        )) : (
          <View className="px-1 py-1.5">
            <Text className="text-text-secondary" style={styles.noteText}>
              No languages recorded yet.
            </Text>
          </View>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}

function CommandLineButton({
  disabled,
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
      className="h-8 justify-center rounded-md border border-border-primary bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted"
      disabled={disabled}
      onPress={onPress}
      style={disabled ? styles.disabled : null}
    >
      <Text className="font-medium text-text-primary" style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function CliStatusText({ status }: { status: DiffCliInstallStatus | null }) {
  return (
    <Text
      className={status?.installed ? "font-medium text-text-primary" : "font-medium text-text-secondary"}
      style={styles.statusText}
    >
      {status?.installed ? "Installed" : "Not installed"}
    </Text>
  );
}

function getProfileSourceCommand(profilePath: string | null | undefined) {
  if (profilePath?.endsWith("/.zshrc")) {
    return "source ~/.zshrc";
  }
  if (profilePath?.endsWith("/.bash_profile")) {
    return "source ~/.bash_profile";
  }
  return null;
}

function CommandLineSettingsPage() {
  const [status, setStatus] = useState<DiffCliInstallStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const sourceCommand = getProfileSourceCommand(status?.profilePath);

  const refreshStatus = () => {
    getDiffCliInstallStatus()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setError(null);
      })
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleInstall = () => {
    setIsInstalling(true);
    installDiffCli()
      .then((nextStatus) => {
        setStatus(nextStatus);
        setError(null);
      })
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        setIsInstalling(false);
      });
  };

  return (
    <SettingsPage>
      <SettingsSection
        first
        title={null}
      >
        <SettingsRow
          align="center"
          control={<CliStatusText status={status} />}
          title="ld"
        />
        <SettingsRow
          align="center"
          control={(
            <CommandLineButton
              disabled={isInstalling}
              label={status?.installed ? "Reinstall" : isInstalling ? "Installing..." : "Install"}
              onPress={handleInstall}
            />
          )}
          description={status?.scriptPath ?? "Creates the command script in the app data folder."}
          title="Command"
        />
        {status?.profilePath ? (
          <SettingsRow
            align="center"
            control={(
              <Text className="text-text-secondary" numberOfLines={1} style={styles.pathText}>
                {status.profileInstalled ? "Configured" : "Missing"}
              </Text>
            )}
            description={status.profilePath}
            title="Profile"
          />
        ) : null}
        {sourceCommand ? (
          <View className="px-1 pt-1">
            <Text className="text-text-secondary leading-relaxed" style={styles.noteText}>
              New terminal windows will pick up ld automatically. In an existing terminal, run {sourceCommand}.
            </Text>
          </View>
        ) : null}
        {error ? (
          <View className="px-1 pt-1">
            <Text className="text-danger" style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </SettingsSection>
    </SettingsPage>
  );
}

const pages: SettingsWindowPage<DiffSettingsPage>[] = [
  {
    id: "appearance",
    render: () => <AppearanceSettingsPage />,
    title: "Appearance",
  },
  {
    id: "syntax",
    render: () => <SyntaxSettingsPage />,
    title: "Syntax",
  },
  {
    id: "commandLine",
    render: () => <CommandLineSettingsPage />,
    title: "Command Line",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useDiffSyntaxTheme();

  return (
    <SharedSettingsWindow
      appearance={syntaxTheme.appearance}
      pages={pages}
      windowIdentifier={diffSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;

const styles = StyleSheet.create({
  buttonText: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 12,
  },
  noteText: {
    fontSize: 12,
  },
  pathText: {
    fontSize: 12,
    maxWidth: 260,
  },
  statusText: {
    fontSize: 13,
  },
});
