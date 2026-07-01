import { PortalProvider } from "@gorhom/portal";
import {
    LegendList,
    type LegendListRef,
    type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import {
    SidebarSplitView,
    type SidebarSplitViewAppearance,
} from "@legend-desktop/appkit-split-view";
import {
    SettingsSidebar,
} from "@legend-desktop/settings-window";
import { setWindowOptions } from "@legend-desktop/window-manager";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TooltipProvider } from "@/components/TooltipProvider";
import { AccountSettingsContent } from "@/settings/AccountSettings";
import { CustomizeUISettingsContent } from "@/settings/CustomizeUISettings";
import { GeneralSettingsContent } from "@/settings/GeneralSettings";
import { LibrarySettingsContent } from "@/settings/LibrarySettings";
import { OpenSourceSettingsContent } from "@/settings/OpenSourceSettings";
import { OverlaySettingsContent } from "@/settings/OverlaySettings";
import { ThemeSettingsContent } from "@/settings/ThemeSettings";
import { SUPPORT_ACCOUNTS } from "@/systems/constants";
import { normalizeMusicAppearanceSettings, settings$ } from "@/systems/Settings";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { getMusicThemeAppearance } from "@/theme/musicThemes";
import { ax } from "@/utils/ax";

export type SettingsPage = "general" | "library" | "overlay" | "theme" | "ui-customize" | "account" | "open-source";

type MusicSettingsListPage = {
    id: SettingsPage;
    renderContent: () => ReactNode;
    title: string;
};

const SETTINGS_TITLEBAR_CONTENT_INSET = 56;
const SETTINGS_WINDOW_IDENTIFIER = "settings";

const SETTING_PAGES: MusicSettingsListPage[] = ax([
    { id: "general", title: "General", renderContent: () => <GeneralSettingsContent /> },
    { id: "library", title: "Library", renderContent: () => <LibrarySettingsContent /> },
    { id: "overlay", title: "Overlay", renderContent: () => <OverlaySettingsContent /> },
    { id: "theme", title: "Appearance", renderContent: () => <ThemeSettingsContent /> },
    { id: "ui-customize", title: "Customize UI", renderContent: () => <CustomizeUISettingsContent /> },
    SUPPORT_ACCOUNTS && { id: "account", title: "Account", renderContent: () => <AccountSettingsContent /> },
    { id: "open-source", title: "Open Source", renderContent: () => <OpenSourceSettingsContent /> },
]);

function isSettingsPage(value: unknown): value is SettingsPage {
    return typeof value === "string" && SETTING_PAGES.some((page) => page.id === value);
}

function reportMusicSettingsWindowError(error: unknown) {
    console.error("Failed to update music settings window", error);
}

const keyExtractor = (page: MusicSettingsListPage) => page.id;

export default function SettingsContainer({ initialPage }: { initialPage?: string }) {
    const listRef = useRef<LegendListRef | null>(null);
    const initialSettingsPage = isSettingsPage(initialPage) ? initialPage : SETTING_PAGES[0].id;
    const [selectedPage, setSelectedPage] = useState<SettingsPage>(initialSettingsPage);
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getMusicThemeAppearance(appearanceSettings.theme);
    const pageIndexById = useMemo(() => new Map(SETTING_PAGES.map((page, index) => [page.id, index])), []);

    useEffect(() => {
        setWindowOptions(SETTINGS_WINDOW_IDENTIFIER, {
            windowStyle: {
                appearance: splitViewAppearance,
            },
        }).catch(reportMusicSettingsWindowError);
    }, [splitViewAppearance]);

    useEffect(() => {
        const initialIndex = pageIndexById.get(initialSettingsPage) ?? 0;
        if (initialIndex > 0) {
            requestAnimationFrame(() => {
                listRef.current?.scrollToIndex({
                    animated: false,
                    index: initialIndex,
                    viewOffset: SETTINGS_TITLEBAR_CONTENT_INSET,
                    viewPosition: 0,
                }).catch(reportMusicSettingsWindowError);
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
            }).catch(reportMusicSettingsWindowError);
        }
    }, [pageIndexById]);

    const handleFirstVisibleItemChanged = useCallback((info: { index: number }) => {
        const page = SETTING_PAGES[info.index];
        if (page) {
            setSelectedPage(page.id);
        }
    }, []);

    const renderSettingsPage = useCallback((props: LegendListRenderItemProps<MusicSettingsListPage>) => (
        <SettingsListPageRow {...props} />
    ), []);

    return (
        <View className="flex-1" style={styles.root}>
            <ThemeProvider>
                <PortalProvider>
                    <TooltipProvider>
                        <MusicSettingsWindowLayout
                            appearance={splitViewAppearance}
                            onSelectionChange={scrollToPage}
                            selectedPage={selectedPage}
                        >
                            <LegendList
                                contentContainerStyle={styles.settingsListContent}
                                data={SETTING_PAGES}
                                estimatedItemSize={520}
                                keyExtractor={keyExtractor}
                                onFirstVisibleItemChanged={handleFirstVisibleItemChanged}
                                ref={listRef}
                                renderItem={renderSettingsPage}
                                style={styles.settingsList}
                            />
                        </MusicSettingsWindowLayout>
                    </TooltipProvider>
                </PortalProvider>
            </ThemeProvider>
        </View>
    );
}

type MusicSettingsWindowLayoutProps = {
    appearance: SidebarSplitViewAppearance;
    children: ReactNode;
    onSelectionChange: (pageId: SettingsPage) => void;
    selectedPage: SettingsPage;
};

function MusicSettingsWindowLayout({
    appearance,
    children,
    onSelectionChange,
    selectedPage,
}: MusicSettingsWindowLayoutProps) {
    return (
        <SidebarSplitView
            appearance={appearance}
            className="flex-1 bg-background-primary"
            contentMinWidth={340}
            sidebarMinWidth={180}
            style={styles.root}
        >
            <View className="flex-1 overflow-hidden" style={styles.pane}>
                <SettingsSidebar
                    onSelectionChange={onSelectionChange}
                    pages={SETTING_PAGES}
                    selectedPage={selectedPage}
                />
                <SettingsToolbarBackground />
            </View>
            <View className="flex-1 overflow-hidden bg-background-primary" style={styles.pane}>
                {children}
                <SettingsToolbarBackground />
            </View>
        </SidebarSplitView>
    );
}

function SettingsListPageRow({ index, item }: LegendListRenderItemProps<MusicSettingsListPage>) {
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
