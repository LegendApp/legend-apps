import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    VirtualizedSettingsWindow,
    SettingsPage,
} from "@legendapp/spark/ui/settings";
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
import { WindowsNavigator } from "../windows";
import { SpotifySettingsContent } from "./SpotifySettings";
import { AppleMusicSettingsContent } from "./AppleMusicSettings";

const SETTINGS_WINDOW_IDENTIFIER = WindowsNavigator.getId("SettingsWindow");

const settingsPages = [
    <SettingsPage key="general" id="general" title="General" icon="gearshape">
        <GeneralSettingsContent />
    </SettingsPage>,
    <SettingsPage key="hotkeys" id="hotkeys" title="Hotkeys" icon="keyboard">
        <HotkeysSettingsContent />
    </SettingsPage>,
    <SettingsPage key="library" id="library" title="Library" icon="music.note.list">
        <LibrarySettingsContent />
    </SettingsPage>,
    <SettingsPage key="spotify" id="spotify" title="Spotify" icon="music.note">
        <SpotifySettingsContent />
    </SettingsPage>,
    <SettingsPage key="apple-music" id="apple-music" title="Apple Music" icon="music.note">
        <AppleMusicSettingsContent />
    </SettingsPage>,
    <SettingsPage key="overlay" id="overlay" title="Overlay" icon="rectangle.on.rectangle">
        <OverlaySettingsContent />
    </SettingsPage>,
    <SettingsPage key="theme" id="theme" title="Appearance" icon="paintbrush">
        <ThemeSettingsContent />
    </SettingsPage>,
    <SettingsPage key="ui-customize" id="ui-customize" title="Customize UI" icon="slider.horizontal.3">
        <CustomizeUISettingsContent />
    </SettingsPage>,
    ...(SUPPORT_ACCOUNTS ? [
        <SettingsPage key="account" id="account" title="Account" icon="person.crop.circle">
            <AccountSettingsContent />
        </SettingsPage>,
    ] : []),
    <SettingsPage key="open-source" id="open-source" title="Open Source" icon="chevron.left.forwardslash.chevron.right">
        <OpenSourceSettingsContent />
    </SettingsPage>,
];

export default function SettingsContainer({ initialPage }: { initialPage?: string }) {
    const initialSettingsPage = settingsPages.some(page => page.props.id === initialPage) ? initialPage : "general";
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getMusicThemeAppearance(appearanceSettings.theme);

    return (
        <ThemeProvider>
            <PortalProvider>
                <TooltipProvider>
                    <ToastProvider>
                        <VirtualizedSettingsWindow
                            appearance={splitViewAppearance}
                            defaultPageId={initialSettingsPage}
                            windowId={SETTINGS_WINDOW_IDENTIFIER}
                        >
                            {settingsPages}
                        </VirtualizedSettingsWindow>
                    </ToastProvider>
                </TooltipProvider>
            </PortalProvider>
        </ThemeProvider>
    );
}
