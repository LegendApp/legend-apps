import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { useToast } from "../components/Toast";
import { appleMusicProvider, appleMusicStatus$ } from "../providers/appleMusic/provider";
import { refreshProviderPlaylists } from "../providers/registry";
import { settings$ } from "../systems/Settings";
import { SettingsCaption, SettingsConnectionRow, SettingsSection } from "./components";

export function AppleMusicSettingsContent() {
    const showToast = useToast();
    const status = useValue(appleMusicStatus$);
    const connected = status.enabled && status.authenticated;

    const handleConnect = useCallback(async () => {
        settings$.providers.appleMusic.enabled.set(true);
        try {
            await appleMusicProvider.login();
            await refreshProviderPlaylists();
        } catch (error) {
            settings$.providers.appleMusic.enabled.set(false);
            showToast(error instanceof Error ? error.message : "Apple Music sign-in failed.", "error");
        }
    }, [showToast]);

    const handleDisconnect = useCallback(async () => {
        try {
            await appleMusicProvider.logout();
            settings$.providers.appleMusic.enabled.set(false);
            await refreshProviderPlaylists();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not disconnect Apple Music.", "error");
        }
    }, [showToast]);

    return (
        <SettingsSection>
            <SettingsCaption>Search and play Apple Music through MusicKit on this Mac.</SettingsCaption>
            <SettingsConnectionRow
                connected={connected}
                label={connected ? status.displayName || "Apple Music" : "Not connected"}
                description={status.error ?? (connected ? status.detail : "macOS may ask for Media & Apple Music access.")}
                disabled={status.isLoading}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
            />
        </SettingsSection>
    );
}
