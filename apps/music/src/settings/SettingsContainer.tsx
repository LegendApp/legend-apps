import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    VirtualizedSettingsWindow,
    type VirtualizedSettingsWindowPage,
} from "@legend-desktop/settings-window";
import { StyleSheet, View } from "react-native";
import { TooltipProvider } from "../components/TooltipProvider";
import { AccountSettingsContent } from "./AccountSettings";
import { CustomizeUISettingsContent } from "./CustomizeUISettings";
import { GeneralSettingsContent } from "./GeneralSettings";
import { LibrarySettingsContent } from "./LibrarySettings";
import { OpenSourceSettingsContent } from "./OpenSourceSettings";
import { OverlaySettingsContent } from "./OverlaySettings";
import { ThemeSettingsContent } from "./ThemeSettings";
import { SUPPORT_ACCOUNTS } from "../systems/constants";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { ThemeProvider } from "../theme/ThemeProvider";
import { getMusicThemeAppearance } from "../theme/musicThemes";
import { ax } from "../utils/ax";

export type SettingsPage = "general" | "library" | "overlay" | "theme" | "ui-customize" | "account" | "open-source";

const SETTINGS_WINDOW_IDENTIFIER = "settings";

const SETTING_PAGES: VirtualizedSettingsWindowPage<SettingsPage>[] = ax([
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

export default function SettingsContainer({ initialPage }: { initialPage?: string }) {
    const initialSettingsPage = isSettingsPage(initialPage) ? initialPage : SETTING_PAGES[0].id;
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getMusicThemeAppearance(appearanceSettings.theme);

    return (
        <View className="flex-1" style={styles.root}>
            <ThemeProvider>
                <PortalProvider>
                    <TooltipProvider>
                        <VirtualizedSettingsWindow
                            appearance={splitViewAppearance}
                            backgroundClassName="bg-background-primary"
                            contentBackgroundClassName="bg-background-primary"
                            estimatedItemSize={520}
                            initialPage={initialSettingsPage}
                            pages={SETTING_PAGES}
                            windowIdentifier={SETTINGS_WINDOW_IDENTIFIER}
                        />
                    </TooltipProvider>
                </PortalProvider>
            </ThemeProvider>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});
