import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    SettingsWindow,
    type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { getLegendThemeAppearance } from "@legend-desktop/theme";
import { View } from "react-native";
import { TooltipProvider } from "@/components/TooltipProvider";
import { AccountSettings } from "@/settings/AccountSettings";
import { CustomizeUISettings } from "@/settings/CustomizeUISettings";
import { GeneralSettings } from "@/settings/GeneralSettings";
import { LibrarySettings } from "@/settings/LibrarySettings";
import { OpenSourceSettings } from "@/settings/OpenSourceSettings";
import { OverlaySettings } from "@/settings/OverlaySettings";
import { ThemeSettings } from "@/settings/ThemeSettings";
import { SUPPORT_ACCOUNTS } from "@/systems/constants";
import { normalizeMusicAppearanceSettings, settings$ } from "@/systems/Settings";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ax } from "@/utils/ax";

export type SettingsPage = "general" | "library" | "overlay" | "theme" | "ui-customize" | "account" | "open-source";

// Define the categories for settings
const SETTING_PAGES: SettingsWindowPage<SettingsPage>[] = ax([
    { id: "general", title: "General", render: () => <GeneralSettings /> },
    { id: "library", title: "Library", render: () => <LibrarySettings /> },
    { id: "overlay", title: "Overlay", render: () => <OverlaySettings /> },
    { id: "theme", title: "Appearance", render: () => <ThemeSettings /> },
    { id: "ui-customize", title: "Customize UI", render: () => <CustomizeUISettings /> },
    SUPPORT_ACCOUNTS && { id: "account", title: "Account", render: () => <AccountSettings /> },
    { id: "open-source", title: "Open Source", render: () => <OpenSourceSettings /> },
]);

function isSettingsPage(value: unknown): value is SettingsPage {
    return typeof value === "string" && SETTING_PAGES.some((page) => page.id === value);
}

export default function SettingsContainer({ initialPage }: { initialPage?: string }) {
    const initialSettingsPage = isSettingsPage(initialPage) ? initialPage : undefined;
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getLegendThemeAppearance(appearanceSettings.theme);

    return (
        <View className="flex-1" style={{ flex: 1 }}>
            <ThemeProvider>
                <PortalProvider>
                    <TooltipProvider>
                        <SettingsWindow
                            appearance={splitViewAppearance}
                            backgroundClassName="bg-background-primary"
                            contentBackgroundClassName="bg-background-primary"
                            initialPage={initialSettingsPage}
                            pages={SETTING_PAGES}
                            windowIdentifier="settings"
                        />
                    </TooltipProvider>
                </PortalProvider>
            </ThemeProvider>
        </View>
    );
}
