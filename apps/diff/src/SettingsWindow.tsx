import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import {
  SidebarSplitView,
  type SidebarSplitViewAppearance,
} from "@legend-desktop/appkit-split-view";
import { SelectControl, SwitchControl } from "@legend-desktop/design-system";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsSidebar,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { setWindowOptions } from "@legend-desktop/window-manager";
import { diffSettingsWindowIdentifier } from "./appConstants";
import { getDiffCliInstallStatus, installDiffCli, type DiffCliInstallStatus } from "./diffCli";
import {
  diffFontFamilyOptions,
  diffFontSizeOptions,
  diffRowRendererOptions,
  setDiffAdaptiveLightModeEnabledSetting,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffRowRendererSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxPrewarmEnabledSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxThemeSetting,
  useDiffAdaptiveLightModeEnabledSetting,
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
type DiffSettingsListPage = {
  id: DiffSettingsPage;
  renderContent: () => ReactNode;
  title: string;
};

const SETTINGS_TITLEBAR_CONTENT_INSET = 56;

const diffFontSizeSettingOptions = diffFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

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
  const rowRenderer = useDiffRowRendererSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <>
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
    </>
  );
}

const pages: DiffSettingsListPage[] = [
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
    id: "commandLine",
    renderContent: () => <CommandLineSettingsContent />,
    title: "Command Line",
  },
];

function reportDiffSettingsWindowError(error: unknown) {
  console.error("Failed to update diff settings window", error);
}

const keyExtractor = (page: DiffSettingsListPage) => page.id;

export function SettingsWindow() {
  const listRef = useRef<LegendListRef | null>(null);
  const syntaxTheme = useDiffSyntaxTheme();
  const [selectedPage, setSelectedPage] = useState<DiffSettingsPage>(pages[0].id);
  const pageIndexById = useMemo(() => new Map(pages.map((page, index) => [page.id, index])), []);

  useEffect(() => {
    setWindowOptions(diffSettingsWindowIdentifier, {
      windowStyle: {
        appearance: syntaxTheme.appearance,
      },
    }).catch(reportDiffSettingsWindowError);
  }, [syntaxTheme.appearance]);

  const scrollToPage = useCallback((pageId: DiffSettingsPage) => {
    const index = pageIndexById.get(pageId);
    if (index !== undefined) {
      setSelectedPage(pageId);
      listRef.current?.scrollToIndex({
        animated: true,
        index,
        viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
        viewPosition: 0,
      }).catch(reportDiffSettingsWindowError);
    }
  }, [pageIndexById]);

  const handleFirstVisibleItemChanged = useCallback((info: { index: number }) => {
    const page = pages[info.index];
    if (page) {
      setSelectedPage(page.id);
    }
  }, []);

  const renderSettingsPage = useCallback((props: LegendListRenderItemProps<DiffSettingsListPage>) => (
    <SettingsListPageRow {...props} />
  ), []);

  return (
    <DiffSettingsWindowLayout
      appearance={syntaxTheme.appearance}
      onSelectionChange={scrollToPage}
      selectedPage={selectedPage}
    >
      <LegendList
        contentContainerStyle={styles.settingsListContent}
        data={pages}
        estimatedItemSize={360}
        keyExtractor={keyExtractor}
        onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
        ref={listRef}
        renderItem={renderSettingsPage}
        style={styles.settingsList}
      />
    </DiffSettingsWindowLayout>
  );
}

export default SettingsWindow;

type DiffSettingsWindowLayoutProps = {
  appearance: SidebarSplitViewAppearance;
  children: ReactNode;
  onSelectionChange: (pageId: DiffSettingsPage) => void;
  selectedPage: DiffSettingsPage;
};

function DiffSettingsWindowLayout({
  appearance,
  children,
  onSelectionChange,
  selectedPage,
}: DiffSettingsWindowLayoutProps) {
  return (
    <SidebarSplitView
      appearance={appearance}
      className="flex-1 bg-background"
      contentMinWidth={340}
      sidebarMinWidth={180}
      style={styles.root}
    >
      <View className="flex-1 overflow-hidden" style={styles.pane}>
        <SettingsSidebar
          onSelectionChange={onSelectionChange}
          pages={pages}
          selectedPage={selectedPage}
        />
        <SettingsToolbarBackground />
      </View>
      <View className="flex-1 overflow-hidden bg-background" style={styles.pane}>
        {children}
        <SettingsToolbarBackground />
      </View>
    </SidebarSplitView>
  );
}

function SettingsListPageRow({ index, item }: LegendListRenderItemProps<DiffSettingsListPage>) {
  return (
    <View className="flex-col gap-5" style={index > 0 ? styles.settingsListPageAfterFirst : undefined}>
      <View className="flex-col gap-1.5">
        <Text className="text-xl font-semibold text-text-primary leading-tight">{item.title}</Text>
      </View>
      <View className="flex-col">
        {item.renderContent()}
      </View>
    </View>
  );
}

function SettingsToolbarBackground() {
  return (
    <View
      className="absolute left-0 right-0 top-0 bg-gradient-to-b from-background-primary from-60% to-background-primary/0"
      pointerEvents="none"
      style={styles.toolbarBackground}
    />
  );
}

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
  pane: {
    flex: 1,
    minWidth: 0,
  },
  root: {
    flex: 1,
  },
  settingsList: {
    flex: 1,
  },
  settingsListContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingBottom: 28,
    paddingHorizontal: 30,
    paddingTop: SETTINGS_TITLEBAR_CONTENT_INSET,
    width: "100%",
  },
  settingsListPageAfterFirst: {
    marginTop: 42,
  },
  statusText: {
    fontSize: 13,
  },
  toolbarBackground: {
    height: SETTINGS_TITLEBAR_CONTENT_INSET,
    zIndex: 1,
  },
});
