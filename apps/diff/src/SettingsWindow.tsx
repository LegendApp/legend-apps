import { SelectControl, SwitchControl } from "@legend-desktop/design-system";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  VirtualizedSettingsWindow,
  type VirtualizedSettingsWindowPage,
} from "@legend-desktop/settings-window";
import {
  getSyntaxLanguageLabel,
  SourceSyntaxToggleSettingsRows,
  SourceTypographySettingsRows,
  SyntaxThemeSelectorSection,
} from "@legend-desktop/syntax-settings";
import { diffSettingsWindowIdentifier } from "./appConstants";
import { getDiffCliInstallStatus, installDiffCli, type DiffCliInstallStatus } from "./diffCli";
import {
  diffFontFamilyOptions,
  diffRowRendererOptions,
  setDiffAdaptiveLightModeEnabledSetting,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffRowRendererSetting,
  setDiffRestoreWindowsOnStartupSetting,
  setDiffShowOnlyHunksSetting,
  setDiffShowStatisticsPanelSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxPrewarmEnabledSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxThemeSetting,
  useDiffAdaptiveLightModeEnabledSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffRowRendererSetting,
  useDiffRestoreWindowsOnStartupSetting,
  useDiffShowOnlyHunksSetting,
  useDiffShowStatisticsPanelSetting,
  useDiffSyntaxHighlightingEnabledSetting,
  useDiffSyntaxPrewarmEnabledSetting,
  useDiffSyntaxPrewarmKnownLanguagesSetting,
  useDiffSyntaxPrewarmLanguagesSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance" | "syntax" | "debugging" | "commandLine";

function AppearanceSettingsPage() {
  return (
    <SettingsPage>
      <AppearanceSettingsContent />
    </SettingsPage>
  );
}

function AppearanceSettingsContent() {
  const adaptiveLightModeEnabled = useDiffAdaptiveLightModeEnabledSetting();
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const restoreWindowsOnStartup = useDiffRestoreWindowsOnStartupSetting();
  const rowRenderer = useDiffRowRendererSetting();
  const showOnlyHunks = useDiffShowOnlyHunksSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <>
      <SettingsSection
        first
        title={null}
      >
        <SourceTypographySettingsRows
          fontAccessibilityLabel="Diff font"
          fontFamily={fontFamily}
          fontFamilyOptions={diffFontFamilyOptions}
          fontSize={fontSize}
          fontSizeAccessibilityLabel="Diff font size"
          onFontFamilyChange={setDiffFontFamilySetting}
          onFontSizeChange={setDiffFontSizeSetting}
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
            <SwitchControl
              accessibilityLabel="Restore windows on startup"
              checked={restoreWindowsOnStartup}
              onChange={setDiffRestoreWindowsOnStartupSetting}
            />
          )}
          description="Reopen previous Diff windows with their saved size and position."
          title="Restore Windows on Startup"
        />
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Show only changed hunks by default"
              checked={showOnlyHunks}
              onChange={setDiffShowOnlyHunksSetting}
            />
          )}
          description="Load local repository diffs with unchanged sections collapsed."
          title="Show only changed hunks by default"
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
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Use adaptive light mode"
              checked={adaptiveLightModeEnabled}
              onChange={setDiffAdaptiveLightModeEnabledSetting}
            />
          )}
          description="Render simpler rows while scrolling quickly."
          title="Adaptive light mode"
        />
      </SettingsSection>
    </>
  );
}

function SyntaxSettingsPage() {
  return (
    <SettingsPage>
      <SyntaxSettingsContent />
    </SettingsPage>
  );
}

function SyntaxSettingsContent() {
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
    <>
      <SettingsSection
        first
        title={null}
      >
        <SourceSyntaxToggleSettingsRows
          onSyntaxHighlightingChange={setDiffSyntaxHighlightingEnabledSetting}
          onSyntaxPrewarmChange={setDiffSyntaxPrewarmEnabledSetting}
          syntaxHighlightingEnabled={syntaxHighlightingEnabled}
          syntaxPrewarmEnabled={syntaxPrewarmEnabled}
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
          <View className="px-1 py-2">
            <Text className="text-xs text-text-secondary">
              No languages recorded yet.
            </Text>
          </View>
        )}
      </SettingsSection>
    </>
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
      className={`h-8 justify-center rounded-md border border-border-primary bg-surface px-3 hover:bg-surface-muted active:bg-surface-muted${disabled ? " opacity-60" : ""}`}
      disabled={disabled}
      onPress={onPress}
    >
      <Text className="text-sm font-medium text-text-primary">{label}</Text>
    </Pressable>
  );
}

function DebuggingSettingsPage() {
  return (
    <SettingsPage>
      <DebuggingSettingsContent />
    </SettingsPage>
  );
}

function DebuggingSettingsContent() {
  const showStatisticsPanel = useDiffShowStatisticsPanelSetting();

  return (
    <SettingsSection
      first
      title={null}
    >
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Show statistics panel"
            checked={showStatisticsPanel}
            onChange={setDiffShowStatisticsPanelSetting}
          />
        )}
        description="Show a small overlay with load and document statistics."
        title="Show statistics panel"
      />
    </SettingsSection>
  );
}

function CliStatusText({ status }: { status: DiffCliInstallStatus | null }) {
  return (
    <Text
      className={status?.installed ? "text-sm font-medium text-text-primary" : "text-sm font-medium text-text-secondary"}
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
  return (
    <SettingsPage>
      <CommandLineSettingsContent />
    </SettingsPage>
  );
}

function CommandLineSettingsContent() {
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
    <>
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
              <Text className="max-w-64 text-xs text-text-secondary" numberOfLines={1}>
                {status.profileInstalled ? "Configured" : "Missing"}
              </Text>
            )}
            description={status.profilePath}
            title="Profile"
          />
        ) : null}
        {sourceCommand ? (
          <View className="px-1 pt-1">
            <Text className="text-xs leading-relaxed text-text-secondary">
              New terminal windows will pick up ld automatically. In an existing terminal, run {sourceCommand}.
            </Text>
          </View>
        ) : null}
        {error ? (
          <View className="px-1 pt-1">
            <Text className="text-xs text-danger">{error}</Text>
          </View>
        ) : null}
      </SettingsSection>
    </>
  );
}

const pages: VirtualizedSettingsWindowPage<DiffSettingsPage>[] = [
  {
    id: "appearance",
    renderContent: () => <AppearanceSettingsContent />,
    title: "Appearance",
  },
  {
    id: "syntax",
    renderContent: () => <SyntaxSettingsContent />,
    title: "Syntax",
  },
  {
    id: "debugging",
    renderContent: () => <DebuggingSettingsContent />,
    title: "Debugging",
  },
  {
    id: "commandLine",
    renderContent: () => <CommandLineSettingsContent />,
    title: "Command Line",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useDiffSyntaxTheme();

  return (
    <VirtualizedSettingsWindow
      appearance={syntaxTheme.appearance}
      estimatedItemSize={360}
      pages={pages}
      windowIdentifier={diffSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
