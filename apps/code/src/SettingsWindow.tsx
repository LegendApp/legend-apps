import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import {
  SidebarSplitView,
  type SidebarSplitViewAppearance,
} from "@legend-desktop/appkit-split-view";
import {
  SettingsSidebar,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { setWindowOptions } from "@legend-desktop/window-manager";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { codeSettingsWindowIdentifier } from "./appConstants";
import {
  setCodeSyntaxThemeSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";

type CodeSettingsPage = "appearance";

type CodeSettingsListPage = {
  id: CodeSettingsPage;
  renderContent: () => ReactNode;
  title: string;
};

const SETTINGS_TITLEBAR_CONTENT_INSET = 56;

function AppearanceSettingsContent() {
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();

  return (
    <SyntaxThemeSelectorSection
      first
      onThemeChange={setCodeSyntaxThemeSetting}
      selectedTheme={selectedSyntaxTheme}
    />
  );
}

const pages: CodeSettingsListPage[] = [
  {
    id: "appearance",
    renderContent: () => <AppearanceSettingsContent />,
    title: "Appearance",
  },
];

function reportCodeSettingsWindowError(error: unknown) {
  console.error("Failed to update code settings window", error);
}

const keyExtractor = (page: CodeSettingsListPage) => page.id;

export function SettingsWindow() {
  const listRef = useRef<LegendListRef | null>(null);
  const syntaxTheme = useCodeSyntaxTheme();
  const [selectedPage, setSelectedPage] = useState<CodeSettingsPage>(pages[0].id);
  const pageIndexById = useMemo(() => new Map(pages.map((page, index) => [page.id, index])), []);

  useEffect(() => {
    setWindowOptions(codeSettingsWindowIdentifier, {
      windowStyle: {
        appearance: syntaxTheme.appearance,
      },
    }).catch(reportCodeSettingsWindowError);
  }, [syntaxTheme.appearance]);

  const scrollToPage = useCallback((pageId: CodeSettingsPage) => {
    const index = pageIndexById.get(pageId);
    if (index !== undefined) {
      setSelectedPage(pageId);
      listRef.current?.scrollToIndex({
        animated: true,
        index,
        viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
        viewPosition: 0,
      }).catch(reportCodeSettingsWindowError);
    }
  }, [pageIndexById]);

  const handleFirstVisibleItemChanged = useCallback((info: { index: number }) => {
    const page = pages[info.index];
    if (page) {
      setSelectedPage(page.id);
    }
  }, []);

  const renderSettingsPage = useCallback((props: LegendListRenderItemProps<CodeSettingsListPage>) => (
    <SettingsListPageRow {...props} />
  ), []);

  return (
    <CodeSettingsWindowLayout
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
    </CodeSettingsWindowLayout>
  );
}

export default SettingsWindow;

type CodeSettingsWindowLayoutProps = {
  appearance: SidebarSplitViewAppearance;
  children: ReactNode;
  onSelectionChange: (pageId: CodeSettingsPage) => void;
  selectedPage: CodeSettingsPage;
};

function CodeSettingsWindowLayout({
  appearance,
  children,
  onSelectionChange,
  selectedPage,
}: CodeSettingsWindowLayoutProps) {
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

function SettingsListPageRow({ index, item }: LegendListRenderItemProps<CodeSettingsListPage>) {
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
  toolbarBackground: {
    height: SETTINGS_TITLEBAR_CONTENT_INSET,
    zIndex: 1,
  },
});
