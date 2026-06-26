import { SelectControl } from "@legend-desktop/design-system";
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
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffSyntaxThemeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance" | "commandLine";

const diffFontSizeSettingOptions = diffFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

function AppearanceSettingsPage() {
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
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
