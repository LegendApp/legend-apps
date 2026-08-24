import { getAppleMusic } from "@legend-apps/apple-music";
import { observable } from "@legendapp/state";
import type { LocalTrack } from "../../systems/LocalMusicState";
import { settings$ } from "../../systems/Settings";
import type { PlaybackStateUpdate, ProviderPlaylist, StreamingProvider } from "../types";

type AppleArtwork = { url?: string };
type ApplePlayParams = { catalogId?: string; id?: string };
type AppleTrackResource = {
    id: string;
    attributes?: {
        name?: string;
        artistName?: string;
        albumName?: string;
        durationInMillis?: number;
        artwork?: AppleArtwork;
        url?: string;
        playParams?: ApplePlayParams;
    };
};

const playbackHandlers = new Set<(update: PlaybackStateUpdate) => void>();
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let playlistsCache: ProviderPlaylist[] = [];
const playlistTracksCache = new Map<string, LocalTrack[]>();

export const appleMusicStatus$ = observable({
    enabled: false,
    authenticated: false,
    displayName: "",
    detail: "Not connected",
    error: null as string | null,
    isLoading: false,
});

function appleSettings() {
    return settings$.providers.appleMusic;
}

function updateStatus(error: string | null = null): void {
    const settings = appleSettings().peek();
    const authenticated = Boolean(settings?.developerToken && settings.userToken);
    appleMusicStatus$.assign({
        enabled: settings?.enabled === true,
        authenticated,
        displayName: settings?.userName ?? "",
        detail: authenticated
            ? settings?.subscription || "Apple Music connected"
            : "Not connected",
        error,
    });
}

function artworkUrl(artwork?: AppleArtwork): string | undefined {
    return artwork?.url?.replace("{w}", "400").replace("{h}", "400");
}

function formatDuration(durationMs = 0): string {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function mapAppleTrack(resource: AppleTrackResource): LocalTrack | null {
    const attributes = resource.attributes;
    const catalogId = attributes?.playParams?.catalogId ?? attributes?.playParams?.id ?? resource.id;
    if (!catalogId || !attributes?.name) return null;
    const durationMs = attributes.durationInMillis ?? 0;
    return {
        id: `appleMusic:${catalogId}`,
        title: attributes.name,
        artist: attributes.artistName ?? "Unknown Artist",
        artists: attributes.artistName ? [attributes.artistName] : [],
        album: attributes.albumName,
        albumUrl: attributes.url,
        duration: formatDuration(durationMs),
        durationMs,
        filePath: `applemusic:song:${catalogId}`,
        fileName: attributes.name,
        thumbnail: artworkUrl(attributes.artwork),
        provider: "appleMusic",
        uri: `applemusic:song:${catalogId}`,
    };
}

function actionableAppleError(status: number, operation: string, body?: string): Error {
    if (status === 401 || status === 403) {
        return new Error(`Apple Music authorization expired while ${operation}. Reconnect Apple Music in Settings → Apple Music, then try again.`);
    }
    if (status === 404) {
        return new Error(`Apple Music could not find that item in your storefront while ${operation}. Search for it again, then retry.`);
    }
    if (status === 429) {
        return new Error(`Apple Music is rate-limiting requests. Wait a minute, then try ${operation} again.`);
    }
    const suffix = body?.trim() ? ` ${body.trim().slice(0, 240)}` : "";
    return new Error(`Apple Music could not finish ${operation} (${status}). Check your connection and try again.${suffix}`);
}

async function ensureTokens(): Promise<{ developerToken: string; userToken: string; storefront: string }> {
    const settings = appleSettings().peek();
    if (!settings?.enabled) {
        throw new Error("Apple Music is disabled. Enable it in Settings → Apple Music, then try again.");
    }
    if (!settings.developerToken || !settings.userToken) {
        throw new Error("Apple Music is not connected. Connect it in Settings → Apple Music, then try again.");
    }
    return {
        developerToken: settings.developerToken,
        userToken: settings.userToken,
        storefront: settings.storefront || "us",
    };
}

async function appleFetch(path: string, operation: string): Promise<Response> {
    const tokens = await ensureTokens();
    const response = await fetch(`https://api.music.apple.com${path}`, {
        headers: {
            Authorization: `Bearer ${tokens.developerToken}`,
            "Music-User-Token": tokens.userToken,
        },
    });
    if (!response.ok) {
        throw actionableAppleError(response.status, operation, await response.text());
    }
    return response;
}

function emitPlayback(update: PlaybackStateUpdate): void {
    playbackHandlers.forEach((handler) => handler(update));
}

function startPolling(): void {
    if (pollingTimer) return;
    pollingTimer = setInterval(() => {
        void getAppleMusic().getPlaybackState()
            .then((state) => emitPlayback({
                isPlaying: state.isPlaying,
                isLoading: state.isLoading,
                positionSeconds: state.positionSeconds,
                durationSeconds: state.durationSeconds,
                artwork: state.artworkUrl || undefined,
                didComplete: state.didComplete,
                error: state.error || null,
            }))
            .catch((error) => emitPlayback({
                error: error instanceof Error ? error.message : "Apple Music playback state failed.",
            }));
    }, 1000);
}

const appleMusicPlayback = {
    id: "appleMusic" as const,
    startsPlaybackOnLoad: true,
    async load(track: LocalTrack, startPositionSeconds = 0) {
        await ensureTokens();
        const trackId = (track.uri ?? track.filePath).split(":").pop() ?? "";
        emitPlayback({ isLoading: true, error: null });
        await getAppleMusic().loadTrack(trackId, Math.max(0, startPositionSeconds));
        startPolling();
    },
    async play() {
        await getAppleMusic().play();
        startPolling();
    },
    async pause() {
        await getAppleMusic().pause();
    },
    async seek(positionSeconds: number) {
        await getAppleMusic().seek(Math.max(0, positionSeconds));
    },
    async setVolume(volume: number) {
        await getAppleMusic().setVolume(Math.max(0, Math.min(1, volume)));
    },
    async stop() {
        await getAppleMusic().stop();
    },
    subscribe(handler: (update: PlaybackStateUpdate) => void) {
        playbackHandlers.add(handler);
        return () => {
            playbackHandlers.delete(handler);
            if (playbackHandlers.size === 0 && pollingTimer) {
                clearInterval(pollingTimer);
                pollingTimer = null;
            }
        };
    },
};

export const appleMusicProvider: StreamingProvider = {
    id: "appleMusic",
    name: "Apple Music",
    status$: appleMusicStatus$,
    playback: appleMusicPlayback,
    async initialize() {
        updateStatus();
        const availability = getAppleMusic().getAvailability();
        if (!availability.available) {
            updateStatus(availability.message);
            return;
        }
        const settings = appleSettings().peek();
        if (settings?.developerToken) {
            try {
                await getAppleMusic().configure(settings.developerToken, settings.userToken ?? "");
                if (settings.userToken) await this.listPlaylists();
            } catch (error) {
                updateStatus(error instanceof Error ? error.message : "Apple Music initialization failed.");
            }
        }
    },
    async login() {
        if (!appleSettings().enabled.peek()) {
            throw new Error("Enable Apple Music in Settings → Apple Music before connecting your account.");
        }
        appleMusicStatus$.isLoading.set(true);
        appleMusicStatus$.error.set(null);
        try {
            const authorization = await getAppleMusic().authorize();
            appleSettings().assign({
                developerToken: authorization.developerToken,
                userToken: authorization.userToken,
                storefront: authorization.storefront,
                userName: authorization.userName,
                subscription: authorization.subscription,
            });
            playlistsCache = [];
            playlistTracksCache.clear();
            updateStatus();
            await this.listPlaylists(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Apple Music sign-in failed.";
            updateStatus(message);
            throw error;
        } finally {
            appleMusicStatus$.isLoading.set(false);
        }
    },
    async logout() {
        await getAppleMusic().logout();
        appleSettings().assign({
            developerToken: "",
            userToken: "",
            storefront: "",
            userName: "",
            subscription: "",
        });
        playlistsCache = [];
        playlistTracksCache.clear();
        updateStatus();
    },
    async search(query: string, limit = 20) {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const { storefront } = await ensureTokens();
        const response = await appleFetch(
            `/v1/catalog/${encodeURIComponent(storefront)}/search?types=songs&limit=${Math.max(1, Math.min(25, limit))}&term=${encodeURIComponent(trimmed)}`,
            "searching",
        );
        const json = await response.json() as { results?: { songs?: { data?: AppleTrackResource[] } } };
        return (json.results?.songs?.data ?? []).map(mapAppleTrack).filter((track): track is LocalTrack => Boolean(track));
    },
    async listPlaylists(force = false) {
        if (!force && playlistsCache.length > 0) return playlistsCache;
        const playlists: ProviderPlaylist[] = [];
        let next: string | null = "/v1/me/library/playlists?limit=100";
        while (next) {
            const response = await appleFetch(next, "loading playlists");
            const json = await response.json() as {
                data?: Array<{ id: string; attributes?: { name?: string; artwork?: AppleArtwork }; relationships?: { tracks?: { data?: unknown[] } } }>;
                next?: string | null;
            };
            playlists.push(...(json.data ?? []).map((playlist) => ({
                provider: "appleMusic" as const,
                id: playlist.id,
                name: playlist.attributes?.name ?? "Untitled Playlist",
                trackCount: playlist.relationships?.tracks?.data?.length ?? 0,
                artwork: artworkUrl(playlist.attributes?.artwork),
            })));
            next = json.next ?? null;
        }
        playlistsCache = playlists;
        return playlists;
    },
    async listPlaylistTracks(playlistId: string) {
        const cached = playlistTracksCache.get(playlistId);
        if (cached) return cached;
        const tracks: LocalTrack[] = [];
        let next: string | null = `/v1/me/library/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
        while (next) {
            const response = await appleFetch(next, "loading playlist tracks");
            const json = await response.json() as { data?: AppleTrackResource[]; next?: string | null };
            tracks.push(...(json.data ?? []).map(mapAppleTrack).filter((track): track is LocalTrack => Boolean(track)));
            next = json.next ?? null;
        }
        playlistTracksCache.set(playlistId, tracks);
        return tracks;
    },
};

settings$.providers.appleMusic.enabled.onChange(() => updateStatus());
