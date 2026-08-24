import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { View } from "react-native";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { useToast } from "../components/Toast";
import { appleMusicProvider, appleMusicStatus$ } from "../providers/appleMusic/provider";
import { refreshProviderPlaylists } from "../providers/registry";
import { settings$ } from "../systems/Settings";
import { SettingsRow, SettingsSection } from "./components";

export function AppleMusicSettingsContent() {
    const showToast = useToast();
    const status = useValue(appleMusicStatus$);
    const enabled = useValue(settings$.providers.appleMusic.enabled);

    const handleConnect = useCallback(async () => {
        try {
            await appleMusicProvider.login();
            await refreshProviderPlaylists();
            showToast("Apple Music connected.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Apple Music sign-in failed.", "error");
        }
    }, [showToast]);

    const handleDisconnect = useCallback(async () => {
        try {
            await appleMusicProvider.logout();
            await refreshProviderPlaylists();
            showToast("Apple Music disconnected.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not disconnect Apple Music.", "error");
        }
    }, [showToast]);

    return (
        <>
            <SettingsSection
                title="Apple Music"
                description="Uses MusicKit directly on this Mac—no Legend backend or manually managed developer token."
            >
                <SettingsRow
                    title="Enable Apple Music"
                    description="Makes Apple Music available to search and AI playlist generation."
                    control={<Checkbox checked={enabled} onChange={(value) => settings$.providers.appleMusic.enabled.set(value)} />}
                />
            </SettingsSection>
            <SettingsSection title="Connection">
                <SettingsRow
                    title={status.authenticated ? status.displayName || "Apple Music" : "Not connected"}
                    description={status.error ?? (status.authenticated
                        ? `${status.detail}. MusicKit authorization and playback are ready.`
                        : "Connect your Apple Music account. macOS may ask for Media & Apple Music access.")}
                    control={(
                        <View className="flex-row gap-2">
                            <Button size="small" variant="accent" disabled={!enabled || status.isLoading} onClick={handleConnect}>
                                {status.authenticated ? "Reconnect" : "Connect"}
                            </Button>
                            <Button size="small" variant="secondary" disabled={!status.authenticated} onClick={handleDisconnect}>
                                Disconnect
                            </Button>
                        </View>
                    )}
                />
            </SettingsSection>
        </>
    );
}
