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
import { getMusicWindowAppearance } from "../theme/musicThemes";
import { WindowsNavigator } from "../windows";
import { SpotifySettingsContent } from "./SpotifySettings";
import { AppleMusicSettingsContent } from "./AppleMusicSettings";

const SETTINGS_WINDOW_IDENTIFIER = WindowsNavigator.getId("SettingsWindow");

const settingsPages = [
    { id: "general", title: "General", icon: "gearshape", Content: GeneralSettingsContent },
    { id: "hotkeys", title: "Hotkeys", icon: "keyboard", Content: HotkeysSettingsContent },
    { id: "library", title: "Library", icon: "music.note.list", Content: LibrarySettingsContent },
    { id: "spotify", title: "Spotify", icon: "music.note", Content: SpotifySettingsContent },
    { id: "apple-music", title: "Apple Music", icon: "music.note", Content: AppleMusicSettingsContent },
    { id: "overlay", title: "Overlay", icon: "rectangle.on.rectangle", Content: OverlaySettingsContent },
    { id: "theme", title: "Appearance", icon: "paintbrush", Content: ThemeSettingsContent },
    { id: "ui-customize", title: "Customize UI", icon: "slider.horizontal.3", Content: CustomizeUISettingsContent },
    ...(SUPPORT_ACCOUNTS ? [
        { id: "account", title: "Account", icon: "person.crop.circle", Content: AccountSettingsContent },
    ] : []),
    { id: "open-source", title: "Open Source", icon: "chevron.left.forwardslash.chevron.right", Content: OpenSourceSettingsContent },
].map(({ id, title, icon, Content }) => (
    <SettingsPage key={id} id={id} title={title} icon={icon} heading={false}>
        <Content />
    </SettingsPage>
));

export default function SettingsContainer({ initialPage }: { initialPage?: string }) {
    const initialSettingsPage = settingsPages.some(page => page.props.id === initialPage) ? initialPage : "general";
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getMusicWindowAppearance(appearanceSettings.theme);

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
