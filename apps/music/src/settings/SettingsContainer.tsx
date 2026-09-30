import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    VirtualizedSettingsWindow,
    type SettingsWindowPage,
} from "@legendapp/spark/settings/window";
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

const SETTINGS_WINDOW_IDENTIFIER = WindowsNavigator.getId("SettingsWindow");

const SETTING_PAGES: SettingsWindowPage<SettingsPage>[] = ax([
    { id: "general", title: "General", render: () => <GeneralSettingsContent /> },
    { id: "hotkeys", title: "Hotkeys", render: () => <HotkeysSettingsContent /> },
    { id: "library", title: "Library", render: () => <LibrarySettingsContent /> },
    { id: "spotify", title: "Spotify", render: () => <SpotifySettingsContent /> },
    { id: "apple-music", title: "Apple Music", render: () => <AppleMusicSettingsContent /> },
    { id: "overlay", title: "Overlay", render: () => <OverlaySettingsContent /> },
    { id: "theme", title: "Appearance", render: () => <ThemeSettingsContent /> },
    { id: "ui-customize", title: "Customize UI", render: () => <CustomizeUISettingsContent /> },
    SUPPORT_ACCOUNTS && { id: "account", title: "Account", render: () => <AccountSettingsContent /> },
    { id: "open-source", title: "Open Source", render: () => <OpenSourceSettingsContent /> },
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
                            defaultPageId={initialSettingsPage}
                            pages={SETTING_PAGES}
                            windowId={SETTINGS_WINDOW_IDENTIFIER}
                        />
                    </ToastProvider>
                </TooltipProvider>
            </PortalProvider>
        </ThemeProvider>
    );
}
