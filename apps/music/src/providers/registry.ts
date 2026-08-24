import { observable } from "@legendapp/state";
import type { LocalTrack } from "../systems/LocalMusicState";
import type { AITrackSource, MusicProviderId } from "../systems/Settings";
import type { ProviderPlaylist, StreamingProvider } from "./types";

const providers = new Map<Exclude<MusicProviderId, "local">, StreamingProvider>();

export const providerLibrary$ = observable({
    playlists: [] as ProviderPlaylist[],
    selectedPlaylist: null as ProviderPlaylist | null,
    selectedTracks: [] as LocalTrack[],
    isLoadingTracks: false,
    error: null as string | null,
});

export const providerSearch$ = observable({
    query: "",
    tracks: [] as LocalTrack[],
    isLoading: false,
    error: null as string | null,
});

export function registerStreamingProvider(provider: StreamingProvider): void {
    providers.set(provider.id, provider);
}

export function getStreamingProvider(id: Exclude<MusicProviderId, "local">): StreamingProvider | undefined {
    return providers.get(id);
}

export function getStreamingProviders(): StreamingProvider[] {
    return Array.from(providers.values());
}

export function getPlaybackProviderForTrack(track: LocalTrack) {
    if (track.provider === "spotify" || track.provider === "appleMusic") {
        return providers.get(track.provider)?.playback;
    }
    return undefined;
}

export function getProviderFixMessage(id: Exclude<MusicProviderId, "local">): string | null {
    const provider = providers.get(id);
    if (!provider) {
        return `${id} is unavailable in this build.`;
    }
    const status = provider.status$.peek();
    if (!status.enabled) {
        return `Enable ${provider.name} in Settings → ${provider.name}, then try again.`;
    }
    if (!status.authenticated) {
        return `Connect ${provider.name} in Settings → ${provider.name}, then try again.`;
    }
    return status.error;
}

export function getAvailableSourceProviders(source: AITrackSource): StreamingProvider[] {
    const candidates = source === "spotify" || source === "appleMusic"
        ? [providers.get(source)].filter((provider): provider is StreamingProvider => Boolean(provider))
        : Array.from(providers.values());
    return candidates.filter((provider) => {
        const status = provider.status$.peek();
        return status.enabled && status.authenticated;
    });
}

export async function searchProviders(query: string, source: AITrackSource, limit = 20): Promise<LocalTrack[]> {
    const candidates = getAvailableSourceProviders(source);
    if (candidates.length === 0) return [];
    const results = await Promise.allSettled(candidates.map((provider) => provider.search(query, limit)));
    const tracks = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (tracks.length === 0 && results.every((result) => result.status === "rejected")) {
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        throw failure?.reason instanceof Error ? failure.reason : new Error("Connected music providers could not finish the search. Try again.");
    }
    return tracks;
}

export async function refreshProviderPlaylists(): Promise<void> {
    const enabled = Array.from(providers.values()).filter((provider) => {
        const status = provider.status$.peek();
        return status.enabled && status.authenticated;
    });
    const results = await Promise.allSettled(enabled.map((provider) => provider.listPlaylists(true)));
    providerLibrary$.playlists.set(results.flatMap((result) => result.status === "fulfilled" ? result.value : []));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    const allFailed = results.length > 0 && results.every((result) => result.status === "rejected");
    const message = failure?.reason instanceof Error
        ? failure.reason.message
        : "Connected music providers could not load playlists. Try reconnecting in Settings.";
    providerLibrary$.error.set(allFailed ? message : null);
}

export async function selectProviderPlaylist(playlist: ProviderPlaylist): Promise<void> {
    const provider = providers.get(playlist.provider);
    if (!provider) {
        throw new Error(`${playlist.provider} is unavailable.`);
    }
    providerLibrary$.assign({ selectedPlaylist: playlist, selectedTracks: [], isLoadingTracks: true, error: null });
    try {
        const tracks = await provider.listPlaylistTracks(playlist.id);
        providerLibrary$.selectedTracks.set(tracks);
    } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to load ${playlist.name}`;
        providerLibrary$.error.set(message);
        throw error;
    } finally {
        providerLibrary$.isLoadingTracks.set(false);
    }
}
