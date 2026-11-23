import { setStringAsync } from "@legendapp/spark/clipboard";
import { Button } from "@legendapp/spark/ui";
import { useValue } from "@legendapp/state/react";
import { useCallback, useState } from "react";
import { Linking, TextInput, View } from "react-native";
import { useToast } from "../components/Toast";
import { refreshProviderPlaylists } from "../providers/registry";
import {
    SPOTIFY_REDIRECT_URI_FOR_DASHBOARD,
    spotifyProvider,
    spotifyStatus$,
    spotifyWebPlayer$,
} from "../providers/spotify/provider";
import { settings$ } from "../systems/Settings";
import {
    SettingsCaption,
    SettingsConnectionRow,
    settingsInputFrame,
    settingsInputStyle,
    settingsInputText,
    SettingsRow,
    SettingsSection,
} from "./components";

export function SpotifySettingsContent() {
    const showToast = useToast();
    const status = useValue(spotifyStatus$);
    const player = useValue(spotifyWebPlayer$);
    const clientId = useValue(settings$.providers.spotify.clientId);
    const [showSetup, setShowSetup] = useState(false);
    const connected = status.enabled && status.authenticated;

    const handleConnect = useCallback(async () => {
        settings$.providers.spotify.enabled.set(true);
        try {
            await spotifyProvider.login();
        } catch (error) {
            settings$.providers.spotify.enabled.set(false);
            showToast(error instanceof Error ? error.message : "Spotify sign-in failed.", "error");
        }
    }, [showToast]);

    const handleDisconnect = useCallback(async () => {
        try {
            await spotifyProvider.logout();
            settings$.providers.spotify.enabled.set(false);
            await refreshProviderPlaylists();
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not disconnect Spotify.", "error");
        }
    }, [showToast]);

    const description = status.error ?? player.error ?? (connected
        ? player.isReady ? "Playback ready." : "Playback starts when the main window is open."
        : "Needs a Client ID and Spotify Premium.");

    return (
        <SettingsSection>
            <SettingsCaption>Search and play Spotify through your own Spotify developer app.</SettingsCaption>
            <SettingsConnectionRow
                connected={connected}
                label={connected ? status.displayName || "Spotify" : "Not connected"}
                description={description}
                disabled={status.isLoading || (!connected && !clientId)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
            />
            <SettingsRow label="Client ID">
                <View className={`${settingsInputFrame} w-64`}>
                    <TextInput
                        accessibilityLabel="Spotify Client ID"
                        value={clientId ?? ""}
                        onChangeText={(value) => settings$.providers.spotify.clientId.set(value.trim())}
                        placeholder="Paste Client ID"
                        autoCapitalize="none"
                        autoCorrect={false}
                        className={settingsInputText}
                        style={settingsInputStyle}
                    />
                </View>
            </SettingsRow>
            {connected ? null : (
                <SettingsRow label="How to get a Client ID">
                    <Button variant="disclosure" expanded={showSetup} onPress={() => setShowSetup(!showSetup)}>
                        Show setup steps
                    </Button>
                </SettingsRow>
            )}
            {!connected && showSetup ? (
                <SettingsCaption>
                    In the Spotify Developer Dashboard, create an app with Web API and Web Playback SDK, add the
                    redirect URI below, then paste the app's Client ID above.
                </SettingsCaption>
            ) : null}
            {!connected && showSetup ? (
                <SettingsRow label="Redirect URI" description={SPOTIFY_REDIRECT_URI_FOR_DASHBOARD}>
                    <View className="flex-row gap-2">
                        <Button onPress={() => void setStringAsync(SPOTIFY_REDIRECT_URI_FOR_DASHBOARD)}>Copy</Button>
                        <Button onPress={() => Linking.openURL("https://developer.spotify.com/dashboard")}>
                            Open Dashboard
                        </Button>
                    </View>
                </SettingsRow>
            ) : null}
        </SettingsSection>
    );
}
