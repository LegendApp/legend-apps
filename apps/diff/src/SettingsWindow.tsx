import { useValue } from "@legendapp/state/react";
import { HotkeyBindingsSettingsContent as SharedHotkeyBindingsSettingsContent } from "@legendapp/spark/shortcuts/commands";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  VirtualizedSettingsWindow,
  SettingsSwitchRow,
} from "@legendapp/spark/ui/settings";
import {
  SourceSyntaxToggleSettingsRows,
  SourceTypographySettingsRows,
  SyntaxThemeSelectorSection,
} from "@legend-apps/syntax-settings";
import { diffSettingsWindowIdentifier } from "./appConstants";
import { getDiffCliInstallStatus, installDiffCli, uninstallDiffCli, type DiffCliInstallStatus } from "./diffCli";
import {
  diffHotkeyDefinitions,
  resetDiffHotkeyBindings,
  setDiffHotkeyBindings,
  useDiffHotkeyBindingsSnapshot,
} from "./diffHotkeys";
import {
  diffSettingsPage$,
  type DiffSettingsPage,
  diffFontFamilyOptions,
  setDiffAdaptiveLightModeEnabledSetting,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffHighlightChangedCharactersSetting,
  setDiffIgnoreWhitespaceChangesSetting,
  setDiffRestoreWindowsOnStartupSetting,
  setDiffShowOnlyHunksSetting,
  setDiffShowStatisticsPanelSetting,
  setDiffShowWhitespaceCharactersSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxThemeSetting,
  useDiffAdaptiveLightModeEnabledSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffHighlightChangedCharactersSetting,
  useDiffIgnoreWhitespaceChangesSetting,
  useDiffRestoreWindowsOnStartupSetting,
  useDiffShowOnlyHunksSetting,
  useDiffShowStatisticsPanelSetting,
  useDiffShowWhitespaceCharactersSetting,
  useDiffSyntaxHighlightingEnabledSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";
import { setDiffManagedWindowRestorationEnabled } from "./diffWindowRestoration";
import { AISkillsSettings } from "./story/AISkillsSettings";
import { CustomizeDiffSettings } from "./customization/CustomizeDiffSettings";

function AppearanceSettingsContent() {
  const adaptiveLightModeEnabled = useDiffAdaptiveLightModeEnabledSetting();
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const restoreWindowsOnStartup = useDiffRestoreWindowsOnStartupSetting();
  const showOnlyHunks = useDiffShowOnlyHunksSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();
  const handleRestoreWindowsOnStartupChange = useCallback((enabled: boolean) => {
    setDiffRestoreWindowsOnStartupSetting(enabled);
    void setDiffManagedWindowRestorationEnabled(enabled);
  }, []);

  return (
    <>
      <SettingsSection>
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
        <SettingsSwitchRow
          description="Reopen previous Diff windows with their saved size and position."
          label="Restore Windows on Startup"
          value={restoreWindowsOnStartup}
          onValueChange={handleRestoreWindowsOnStartupChange}
        />
        <SettingsSwitchRow
          description="Load local repository diffs with unchanged sections collapsed."
          label="Show only changed hunks by default"
          value={showOnlyHunks}
          onValueChange={setDiffShowOnlyHunksSetting}
        />
        <SettingsSwitchRow
          description="Render simpler rows while scrolling quickly."
          label="Adaptive light mode"
          value={adaptiveLightModeEnabled}
          onValueChange={setDiffAdaptiveLightModeEnabledSetting}
        />
      </SettingsSection>
    </>
  );
}

function SyntaxSettingsContent() {
  const highlightChangedCharacters = useDiffHighlightChangedCharactersSetting();
  const ignoreWhitespaceChanges = useDiffIgnoreWhitespaceChangesSetting();
  const showWhitespaceCharacters = useDiffShowWhitespaceCharactersSetting();
  const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();

  return (
    <SettingsSection>
      <SourceSyntaxToggleSettingsRows
        onSyntaxHighlightingChange={setDiffSyntaxHighlightingEnabledSetting}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
      />
      <SettingsSwitchRow
        description="Emphasize character-level changes within paired added and removed lines."
        label="Highlight changed characters"
        value={highlightChangedCharacters}
        onValueChange={setDiffHighlightChangedCharactersSetting}
      />
      <SettingsSwitchRow
        description="Ignore changes that only add, remove, or rearrange whitespace. Open diffs reload when this changes."
        label="Ignore whitespace changes"
        value={ignoreWhitespaceChanges}
        onValueChange={setDiffIgnoreWhitespaceChangesSetting}
      />
      <SettingsSwitchRow
        description="Draw visible markers for spaces and tabs without changing copied text."
        label="Show whitespace characters"
        value={showWhitespaceCharacters}
        onValueChange={setDiffShowWhitespaceCharactersSetting}
      />
    </SettingsSection>
  );
}

function HotkeysSettingsContent() {
  const bindings = useDiffHotkeyBindingsSnapshot();

  return (
    <SharedHotkeyBindingsSettingsContent
      definitions={diffHotkeyDefinitions}
      maxBindingsPerCommand={1}
      onChange={setDiffHotkeyBindings}
      onResetAll={resetDiffHotkeyBindings}
      showTitle={false}
      values={bindings}
    />
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

function DebuggingSettingsContent() {
  const showStatisticsPanel = useDiffShowStatisticsPanelSetting();

  return (
    <SettingsSection>
      <SettingsSwitchRow
        description="Show a small overlay with load and document statistics."
        label="Show statistics panel"
        value={showStatisticsPanel}
        onValueChange={setDiffShowStatisticsPanelSetting}
      />
    </SettingsSection>
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

function getCommandLineDescription(status: DiffCliInstallStatus | null, sourceCommand: string | null) {
  let description = "Open Legend Diff from Terminal with ldiff.";
  if (status?.installed) {
    description = sourceCommand
      ? `Installed. Run \`${sourceCommand}\` in existing terminals.`
      : "Installed.";
  } else if (status && !status.appInstalled) {
    description = "Move Legend Diff.app to /Applications or ~/Applications.";
  } else if (status && !status.profileInstalled) {
    description = "Add ldiff to your shell profile.";
  } else if (status && (!status.scriptInstalled || !status.scriptExecutable)) {
    description = "Install the ldiff launcher.";
  }
  return description;
}

function CommandLineSettingsContent() {
  const [status, setStatus] = useState<DiffCliInstallStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const statusRequestIdRef = useRef(0);
  const sourceCommand = getProfileSourceCommand(status?.profilePath);
  const commandLineDescription = getCommandLineDescription(status, sourceCommand);
  const canUninstall = Boolean(status?.scriptInstalled || status?.scriptExecutable || status?.profileInstalled);

  const refreshStatus = useCallback(() => {
    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;
    getDiffCliInstallStatus()
      .then((nextStatus) => {
        if (statusRequestIdRef.current === requestId) {
          setStatus(nextStatus);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (statusRequestIdRef.current === requestId) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      });
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleInstall = useCallback(() => {
    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;
    setIsInstalling(true);
    installDiffCli()
      .then((nextStatus) => {
        if (statusRequestIdRef.current === requestId) {
          setStatus(nextStatus);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (statusRequestIdRef.current === requestId) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (statusRequestIdRef.current === requestId) {
          setIsInstalling(false);
        }
      });
  }, []);

  const handleUninstall = useCallback(() => {
    const requestId = statusRequestIdRef.current + 1;
    statusRequestIdRef.current = requestId;
    setIsUninstalling(true);
    uninstallDiffCli()
      .then((nextStatus) => {
        if (statusRequestIdRef.current === requestId) {
          setStatus(nextStatus);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (statusRequestIdRef.current === requestId) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      })
      .finally(() => {
        if (statusRequestIdRef.current === requestId) {
          setIsUninstalling(false);
        }
      });
  }, []);

  return (
    <>
      <SettingsSection>
        <SettingsRow
          description={commandLineDescription}
          label="ldiff">
          <View className="flex-row gap-2">
            <CommandLineButton
              disabled={isInstalling || isUninstalling}
              label={isInstalling ? "Installing..." : status?.installed ? "Update" : "Install"}
              onPress={handleInstall}
            />
            {canUninstall ? (
              <CommandLineButton
                disabled={isInstalling || isUninstalling}
                label={isUninstalling ? "Uninstalling..." : "Uninstall"}
                onPress={handleUninstall}
              />
            ) : null}
          </View>
        </SettingsRow>
        {error ? (
          <View className="px-1 pt-1">
            <Text className="text-xs text-danger">{error}</Text>
          </View>
        ) : null}
      </SettingsSection>
    </>
  );
}

export function SettingsWindow() {
  const syntaxTheme = useDiffSyntaxTheme();
  const selectedPageId = useValue(diffSettingsPage$);

  return (
    <VirtualizedSettingsWindow<DiffSettingsPage>
      appearance={syntaxTheme.appearance}
      selectedPageId={selectedPageId}
      onSelectionChange={page => diffSettingsPage$.set(page)}
      windowId={diffSettingsWindowIdentifier}
    >
      <SettingsPage id="aiSkills" title="AI Skills" icon="sparkles">
        <AISkillsSettings />
      </SettingsPage>
      <SettingsPage id="customize" title="Customize App" icon="slider.horizontal.3">
        <CustomizeDiffSettings />
      </SettingsPage>
      <SettingsPage id="appearance" title="Appearance" icon="paintbrush">
        <AppearanceSettingsContent />
      </SettingsPage>
      <SettingsPage id="syntax" title="Syntax" icon="chevron.left.forwardslash.chevron.right">
        <SyntaxSettingsContent />
      </SettingsPage>
      <SettingsPage id="hotkeys" title="Hotkeys" icon="keyboard">
        <HotkeysSettingsContent />
      </SettingsPage>
      <SettingsPage id="debugging" title="Debugging" icon="ladybug">
        <DebuggingSettingsContent />
      </SettingsPage>
      <SettingsPage id="commandLine" title="Command Line" icon="terminal">
        <CommandLineSettingsContent />
      </SettingsPage>
    </VirtualizedSettingsWindow>
  );
}

export default SettingsWindow;
