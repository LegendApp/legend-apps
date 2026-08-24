import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    VirtualizedSettingsWindow,
    type VirtualizedSettingsWindowPage,
} from "@legend-apps/settings-window";
import { TooltipProvider } from "../components/TooltipProvider";
import { ToastProvider } from "../components/Toast";
import { AccountSettingsContent } from "./AccountSettings";
import { CustomizeUISettingsContent } from "./CustomizeUISettings";
import { GeneralSettingsContent } from "./GeneralSettings";
import { HotkeysSettingsContent } from "./HotkeysSettings";
import { LibrarySettingsContent } from "./LibrarySettings";
import { OpenSourceSettingsContent } from "./OpenSourceSettings";
import { OverlaySettingsContent } from "./OverlaySettings";
import { ThemeSettingsContent } from "./ThemeSettings";
import { SUPPORT_ACCOUNTS } from "../systems/constants";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { ThemeProvider } from "../theme/ThemeProvider";
import { getMusicThemeAppearance } from "../theme/musicThemes";
import { ax } from "../utils/ax";
import { WindowsNavigator } from "../windows";
import { SpotifySettingsContent } from "./SpotifySettings";
import { AppleMusicSettingsContent } from "./AppleMusicSettings";

export type SettingsPage = "general" | "hotkeys" | "library" | "spotify" | "apple-music" | "overlay" | "theme" | "ui-customize" | "account" | "open-source";

const SETTINGS_WINDOW_IDENTIFIER = WindowsNavigator.getIdentifier("SettingsWindow");

const SETTING_PAGES: VirtualizedSettingsWindowPage<SettingsPage>[] = ax([
    { id: "general", title: "General", renderContent: () => <GeneralSettingsContent /> },
    { id: "hotkeys", title: "Hotkeys", renderContent: () => <HotkeysSettingsContent /> },
    { id: "library", title: "Library", renderContent: () => <LibrarySettingsContent /> },
    { id: "spotify", title: "Spotify", renderContent: () => <SpotifySettingsContent /> },
    { id: "apple-music", title: "Apple Music", renderContent: () => <AppleMusicSettingsContent /> },
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
        <ThemeProvider>
            <PortalProvider>
                <TooltipProvider>
                    <ToastProvider>
                        <VirtualizedSettingsWindow
                            appearance={splitViewAppearance}
                            backgroundClassName="bg-background-primary"
                            contentBackgroundClassName="bg-background-primary"
                            estimatedItemSize={520}
                            initialPage={initialSettingsPage}
                            pages={SETTING_PAGES}
                            windowIdentifier={SETTINGS_WINDOW_IDENTIFIER}
                        />
                    </ToastProvider>
                </TooltipProvider>
            </PortalProvider>
        </ThemeProvider>
    );
}
