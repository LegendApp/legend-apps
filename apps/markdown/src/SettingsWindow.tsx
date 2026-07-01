import { PortalProvider } from "@gorhom/portal";
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
import { getLegendDisplayThemeAppearance } from "@legend-desktop/theme";
import {
  setWindowOptions,
} from "@legend-desktop/window-manager";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { settingsWindowIdentifier } from "./appConstants";
import { useMarkdownDisplayThemeSetting } from "./markdownSettings";
import { AppearanceSettingsContent } from "./settings/AppearanceSettingsPage";
import { GeneralSettingsContent } from "./settings/GeneralSettingsPage";
import { HotkeysSettingsContent } from "./settings/HotkeysSettingsPage";
import { isSettingsPage, type SettingsPage } from "./settings/settingsPages";

const SETTINGS_TITLEBAR_CONTENT_INSET = 56;

type MarkdownSettingsListPage = {
  id: SettingsPage;
  renderContent: () => ReactNode;
  title: string;
};

const pages: MarkdownSettingsListPage[] = [
  {
    id: "general",
    renderContent: () => <GeneralSettingsContent />,
    title: "General",
  },
  {
    id: "hotkeys",
    renderContent: () => <HotkeysSettingsContent />,
    title: "Hotkeys",
  },
  {
    id: "appearance",
    renderContent: () => <AppearanceSettingsContent />,
    title: "Appearance",
  },
];

function reportMarkdownSettingsWindowError(error: unknown) {
  console.error("Failed to update markdown settings window", error);
}

const keyExtractor = (page: MarkdownSettingsListPage) => page.id;

export function SettingsWindow({ initialPage }: { initialPage?: string }) {
  const listRef = useRef<LegendListRef | null>(null);
  const initialSettingsPage = initialPage && isSettingsPage(initialPage) ? initialPage : pages[0].id;
  const [selectedPage, setSelectedPage] = useState<SettingsPage>(initialSettingsPage);
  const selectedDisplayTheme = useMarkdownDisplayThemeSetting();
  const appearance = getLegendDisplayThemeAppearance(selectedDisplayTheme);
  const pageIndexById = useMemo(() => new Map(pages.map((page, index) => [page.id, index])), []);

  useEffect(() => {
    setWindowOptions(settingsWindowIdentifier, {
      windowStyle: {
        appearance,
      },
    }).catch(reportMarkdownSettingsWindowError);
  }, [appearance]);

  useEffect(() => {
    const initialIndex = pageIndexById.get(initialSettingsPage) ?? 0;
    if (initialIndex > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          animated: false,
          index: initialIndex,
          viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
          viewPosition: 0,
        }).catch(reportMarkdownSettingsWindowError);
      });
    }
  }, [initialSettingsPage, pageIndexById]);

  const scrollToPage = useCallback((pageId: SettingsPage) => {
    const index = pageIndexById.get(pageId);
    if (index !== undefined) {
      setSelectedPage(pageId);
      listRef.current?.scrollToIndex({
        animated: true,
        index,
        viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
        viewPosition: 0,
      }).catch(reportMarkdownSettingsWindowError);
    }
  }, [pageIndexById]);

  const handleFirstVisibleItemChanged = useCallback((info: { index: number }) => {
    const page = pages[info.index];
    if (page) {
      setSelectedPage(page.id);
    }
  }, []);

  const renderSettingsPage = useCallback((props: LegendListRenderItemProps<MarkdownSettingsListPage>) => (
    <SettingsListPageRow {...props} />
  ), []);

  return (
    <PortalProvider>
      <MarkdownSettingsWindowLayout
        appearance={appearance}
        onSelectionChange={scrollToPage}
        selectedPage={selectedPage}
      >
        <LegendList
          contentContainerStyle={styles.settingsListContent}
          data={pages}
          estimatedItemSize={640}
          keyExtractor={keyExtractor}
          onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
          ref={listRef}
          renderItem={renderSettingsPage}
          style={styles.settingsList}
        />
      </MarkdownSettingsWindowLayout>
    </PortalProvider>
  );
}

type MarkdownSettingsWindowLayoutProps = {
  appearance: SidebarSplitViewAppearance;
  children: ReactNode;
  onSelectionChange: (pageId: SettingsPage) => void;
  selectedPage: SettingsPage;
};

function MarkdownSettingsWindowLayout({
  appearance,
  children,
  onSelectionChange,
  selectedPage,
}: MarkdownSettingsWindowLayoutProps) {
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

function SettingsListPageRow({ index, item }: LegendListRenderItemProps<MarkdownSettingsListPage>) {
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

export default SettingsWindow;

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
