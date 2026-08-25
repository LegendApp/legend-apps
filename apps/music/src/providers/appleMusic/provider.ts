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
type AppleTrackPage = { data?: AppleTrackResource[]; next?: string | null };

const playbackHandlers = new Set<(update: PlaybackStateUpdate) => void>();
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let playlistsCache: ProviderPlaylist[] = [];
const playlistTracksCache = new Map<string, LocalTrack[]>();
let nativeAuthorized = false;

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
    const authenticated = settings?.connected === true && nativeAuthorized;
    appleMusicStatus$.assign({
        enabled: settings?.enabled === true,
        authenticated,
        displayName: settings?.userName ?? "",
        detail: authenticated
            ? settings?.subscription || "Apple Music connected"
            : settings?.connected ? "Reconnect to restore MusicKit access" : "Not connected",
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

async function ensureAuthorized(): Promise<{ storefront: string }> {
    const settings = appleSettings().peek();
    if (!settings?.enabled) {
        throw new Error("Apple Music is disabled. Enable it in Settings → Apple Music, then try again.");
    }
    if (!settings.connected) {
        throw new Error("Apple Music is not connected. Connect it in Settings → Apple Music, then try again.");
    }
    if (!nativeAuthorized) {
        const authorization = await getAppleMusic().getAuthorization();
        nativeAuthorized = authorization.authorized;
        updateStatus();
    }
    if (!nativeAuthorized) {
        throw new Error("Apple Music access is no longer authorized. Reconnect it in Settings → Apple Music, then try again.");
    }
    return { storefront: settings.storefront || "us" };
}

async function appleRequest<T>(path: string, operation: string): Promise<T> {
    await ensureAuthorized();
    try {
        return JSON.parse(await getAppleMusic().request(path)) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : `Apple Music could not finish ${operation}.`;
        if (/authoriz|permission|token|sign.?in/i.test(message)) {
            nativeAuthorized = false;
            updateStatus(message);
        }
        throw new Error(message.includes("Apple Music")
            ? message
            : `Apple Music could not finish ${operation}. ${message}`);
    }
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
        await ensureAuthorized();
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
        if (!appleSettings().connected.peek()) return;
        try {
            const authorization = await getAppleMusic().getAuthorization();
            nativeAuthorized = authorization.authorized;
            if (authorization.authorized) {
                appleSettings().assign({
                    storefront: authorization.storefront || appleSettings().storefront.peek(),
                    userName: authorization.userName,
                    subscription: authorization.subscription,
                });
                updateStatus();
                await this.listPlaylists();
            } else {
                updateStatus("Apple Music access needs to be restored. Reconnect in Settings → Apple Music.");
            }
        } catch (error) {
            updateStatus(error instanceof Error ? error.message : "Apple Music initialization failed. Reconnect in Settings → Apple Music.");
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
            nativeAuthorized = authorization.authorized;
            if (!authorization.authorized) {
                throw new Error("Apple Music access was not granted. Allow Media & Apple Music in System Settings → Privacy & Security, then try again.");
            }
            appleSettings().assign({
                connected: true,
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
        nativeAuthorized = false;
        appleSettings().assign({
            connected: false,
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
        const { storefront } = await ensureAuthorized();
        const json = await appleRequest<{ results?: { songs?: { data?: AppleTrackResource[] } } }>(
            `/v1/catalog/${encodeURIComponent(storefront)}/search?types=songs&limit=${Math.max(1, Math.min(25, limit))}&term=${encodeURIComponent(trimmed)}`,
            "searching",
        );
        return (json.results?.songs?.data ?? []).map(mapAppleTrack).filter((track): track is LocalTrack => Boolean(track));
    },
    async listPlaylists(force = false) {
        if (!force && playlistsCache.length > 0) return playlistsCache;
        const playlists: ProviderPlaylist[] = [];
        let next: string | null = "/v1/me/library/playlists?limit=100";
        while (next) {
            const json: {
                data?: Array<{ id: string; attributes?: { name?: string; artwork?: AppleArtwork }; relationships?: { tracks?: { data?: unknown[] } } }>;
                next?: string | null;
            } = await appleRequest(next, "loading playlists");
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
            const page: AppleTrackPage = await appleRequest<AppleTrackPage>(next, "loading playlist tracks");
            tracks.push(...(page.data ?? []).map(mapAppleTrack).filter((track): track is LocalTrack => Boolean(track)));
            next = page.next ?? null;
        }
        playlistTracksCache.set(playlistId, tracks);
        return tracks;
    },
};

settings$.providers.appleMusic.enabled.onChange(() => updateStatus());
