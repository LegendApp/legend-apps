import { SwitchControl } from "@legend-apps/design-system";
import { HotkeyBindingsSettingsContent as SharedHotkeyBindingsSettingsContent } from "@legend-apps/hotkeys";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  VirtualizedSettingsWindow,
  type VirtualizedSettingsWindowPage,
} from "@legend-apps/settings-window";
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
  useDiffHotkeyBindings,
} from "./diffHotkeys";
import {
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

type DiffSettingsPage = "appearance" | "syntax" | "hotkeys" | "debugging" | "commandLine";

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
  const highlightChangedCharacters = useDiffHighlightChangedCharactersSetting();
  const ignoreWhitespaceChanges = useDiffIgnoreWhitespaceChangesSetting();
  const showWhitespaceCharacters = useDiffShowWhitespaceCharactersSetting();
  const syntaxHighlightingEnabled = useDiffSyntaxHighlightingEnabledSetting();

  return (
    <SettingsSection
      first
      title={null}
    >
      <SourceSyntaxToggleSettingsRows
        onSyntaxHighlightingChange={setDiffSyntaxHighlightingEnabledSetting}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
      />
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Highlight changed characters"
            checked={highlightChangedCharacters}
            onChange={setDiffHighlightChangedCharactersSetting}
          />
        )}
        description="Emphasize character-level changes within paired added and removed lines."
        title="Highlight changed characters"
      />
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Ignore whitespace changes"
            checked={ignoreWhitespaceChanges}
            onChange={setDiffIgnoreWhitespaceChangesSetting}
          />
        )}
        description="Ignore changes that only add, remove, or rearrange whitespace. Open diffs reload when this changes."
        title="Ignore whitespace changes"
      />
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Show whitespace characters"
            checked={showWhitespaceCharacters}
            onChange={setDiffShowWhitespaceCharactersSetting}
          />
        )}
        description="Draw visible markers for spaces and tabs without changing copied text."
        title="Show whitespace characters"
      />
    </SettingsSection>
  );
}

function HotkeysSettingsContent() {
  const bindings = useDiffHotkeyBindings();

  return (
    <SharedHotkeyBindingsSettingsContent
      definitions={diffHotkeyDefinitions}
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
      <SettingsSection
        first
        title={null}
      >
        <SettingsRow
          align="center"
          control={(
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
          )}
          description={commandLineDescription}
          title="ldiff"
        />
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
    id: "hotkeys",
    renderContent: () => <HotkeysSettingsContent />,
    title: "Hotkeys",
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
