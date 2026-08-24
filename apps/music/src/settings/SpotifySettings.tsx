import { useValue } from "@legendapp/state/react";
import { useCallback } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { useToast } from "../components/Toast";
import { refreshProviderPlaylists } from "../providers/registry";
import { spotifyProvider, spotifyStatus$, spotifyWebPlayer$ } from "../providers/spotify/provider";
import { settings$ } from "../systems/Settings";
import { SettingsRow, SettingsSection } from "./components";

export function SpotifySettingsContent() {
    const showToast = useToast();
    const status = useValue(spotifyStatus$);
    const player = useValue(spotifyWebPlayer$);
    const enabled = useValue(settings$.providers.spotify.enabled);
    const clientId = useValue(settings$.providers.spotify.clientId);

    const handleConnect = useCallback(async () => {
        try {
            await spotifyProvider.login();
            showToast("Finish connecting Spotify in your browser. Legend Music will update automatically.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Spotify sign-in failed.", "error");
        }
    }, [showToast]);

    const handleDisconnect = useCallback(async () => {
        try {
            await spotifyProvider.logout();
            await refreshProviderPlaylists();
            showToast("Spotify disconnected.");
        } catch (error) {
            showToast(error instanceof Error ? error.message : "Could not disconnect Spotify.", "error");
        }
    }, [showToast]);

    return (
        <>
            <SettingsSection
                title="Spotify"
                description="Search your catalog, browse playlists, and play tracks through Spotify Web Playback. Premium is required for playback."
            >
                <SettingsRow
                    title="Enable Spotify"
                    description="Makes Spotify available to search and AI playlist generation."
                    control={<Checkbox checked={enabled} onChange={(value) => settings$.providers.spotify.enabled.set(value)} />}
                />
                <SettingsRow
                    title="Client ID"
                    description="Create a Spotify app, then add legendmusic://spotify-auth-callback as its redirect URI."
                    className="flex-col items-stretch gap-3"
                    contentClassName="pr-0"
                    controlWrapperClassName="ml-0 w-full"
                    control={(
                        <View className="w-full flex-row items-center gap-2">
                            <TextInput
                                value={clientId ?? ""}
                                onChangeText={(value) => settings$.providers.spotify.clientId.set(value.trim())}
                                placeholder="Spotify Client ID"
                                placeholderTextColor="rgba(255,255,255,0.35)"
                                autoCapitalize="none"
                                autoCorrect={false}
                                className="flex-1 rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-text-primary"
                            />
                            <Button size="small" variant="secondary" onClick={() => Linking.openURL("https://developer.spotify.com/dashboard")}>
                                Dashboard
                            </Button>
                        </View>
                    )}
                />
            </SettingsSection>
            <SettingsSection title="Connection">
                <SettingsRow
                    title={status.authenticated ? status.displayName || "Connected" : "Not connected"}
                    description={status.error ?? (status.authenticated
                        ? `${status.detail}. ${player.isReady ? "Playback device ready." : "Playback device starts when the main window is open."}`
                        : "Connect a Spotify Premium account after entering your Client ID.")}
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
                {player.error ? <Text className="text-xs leading-relaxed text-red-300">{player.error}</Text> : null}
            </SettingsSection>
        </>
    );
}
