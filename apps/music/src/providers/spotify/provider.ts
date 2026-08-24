import { observable } from "@legendapp/state";
import { Linking } from "react-native";
import type { LocalTrack } from "../../systems/LocalMusicState";
import { settings$ } from "../../systems/Settings";
import type { PlaybackStateUpdate, ProviderPlaylist, StreamingProvider } from "../types";
import { refreshProviderPlaylists } from "../registry";
import { createPKCE } from "./pkce";

const API_BASE = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const REDIRECT_URI = "legendmusic://spotify-auth-callback";
const SCOPES = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private",
    "playlist-read-collaborative",
];

type SpotifyImage = { url: string };
type SpotifyArtist = { name: string; external_urls?: { spotify?: string } };
type SpotifyTrack = {
    id?: string;
    name?: string;
    uri?: string;
    duration_ms?: number;
    artists?: SpotifyArtist[];
    album?: { name?: string; images?: SpotifyImage[]; external_urls?: { spotify?: string } };
};
type SpotifyPlayerSnapshot = {
    paused?: boolean;
    position?: number;
    duration?: number;
    track_window?: { current_track?: SpotifyTrack };
};

const playbackHandlers = new Set<(update: PlaybackStateUpdate) => void>();
let linkingSubscription: { remove(): void } | null = null;
let activatePlayer: (() => void) | null = null;
let playlistsCache: ProviderPlaylist[] = [];
const playlistTracksCache = new Map<string, LocalTrack[]>();
let spotifyWasPlaying = false;
let suppressCompletionUntil = 0;

export const spotifyStatus$ = observable({
    enabled: false,
    authenticated: false,
    displayName: "",
    detail: "Not connected",
    error: null as string | null,
    isLoading: false,
});

export const spotifyWebPlayer$ = observable({
    deviceId: "",
    isReady: false,
    token: "",
    error: null as string | null,
});

function spotifySettings() {
    return settings$.providers.spotify;
}

function updateStatus(error: string | null = null): void {
    const settings = spotifySettings().peek();
    const authenticated = Boolean(settings?.refreshToken || (settings?.accessToken && settings.expiresAt > Date.now()));
    spotifyStatus$.assign({
        enabled: settings?.enabled === true,
        authenticated,
        displayName: settings?.displayName ?? "",
        detail: authenticated
            ? settings?.product === "premium" ? "Premium account connected" : "Account connected"
            : "Not connected",
        error,
    });
}

function actionableSpotifyError(status: number, operation: string, body?: string): Error {
    if (status === 401) {
        return new Error(`Spotify authorization expired while ${operation}. Reconnect Spotify in Settings → Spotify, then try again.`);
    }
    if (status === 403) {
        return new Error(`Spotify blocked ${operation}. Web Playback requires a Premium account; reconnect in Settings → Spotify after upgrading or changing accounts.`);
    }
    if (status === 429) {
        return new Error(`Spotify is rate-limiting requests. Wait a minute, then try ${operation} again.`);
    }
    const suffix = body?.trim() ? ` ${body.trim().slice(0, 240)}` : "";
    return new Error(`Spotify could not finish ${operation} (${status}). Check your connection and try again.${suffix}`);
}

function encodeForm(values: Record<string, string>): string {
    return Object.entries(values)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");
}

async function fetchToken(values: Record<string, string>) {
    const clientId = spotifySettings().clientId.peek()?.trim();
    if (!clientId) {
        throw new Error("Spotify needs a Client ID. Add one in Settings → Spotify, then try again.");
    }
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm({ client_id: clientId, ...values }),
    });
    if (!response.ok) {
        throw actionableSpotifyError(response.status, "sign-in", await response.text());
    }
    return response.json() as Promise<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
    }>;
}

export async function ensureSpotifyAccessToken(): Promise<string> {
    const settings = spotifySettings().peek();
    if (settings?.accessToken && settings.expiresAt > Date.now() + 30_000) {
        spotifyWebPlayer$.token.set(settings.accessToken);
        return settings.accessToken;
    }
    if (!settings?.refreshToken) {
        throw new Error("Spotify is not connected. Connect it in Settings → Spotify, then try again.");
    }
    const token = await fetchToken({ grant_type: "refresh_token", refresh_token: settings.refreshToken });
    spotifySettings().assign({
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? settings.refreshToken,
        expiresAt: Date.now() + token.expires_in * 1000 - 60_000,
    });
    spotifyWebPlayer$.token.set(token.access_token);
    updateStatus();
    return token.access_token;
}

async function spotifyFetch(path: string, init: RequestInit = {}, operation = "request"): Promise<Response> {
    const token = await ensureSpotifyAccessToken();
    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
        },
    });
    if (!response.ok && response.status !== 204) {
        throw actionableSpotifyError(response.status, operation, await response.text());
    }
    return response;
}

function formatDuration(durationMs = 0): string {
    const seconds = Math.max(0, Math.round(durationMs / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function mapSpotifyTrack(track: SpotifyTrack, addedAt?: string | null): LocalTrack | null {
    if (!track.uri) return null;
    const durationMs = track.duration_ms ?? 0;
    return {
        id: `spotify:${track.id ?? track.uri}`,
        title: track.name ?? "Unknown Track",
        artist: track.artists?.map((artist) => artist.name).join(", ") || "Unknown Artist",
        artists: track.artists?.map((artist) => artist.name) ?? [],
        artistUrls: track.artists?.flatMap((artist) => artist.external_urls?.spotify ? [artist.external_urls.spotify] : []) ?? [],
        album: track.album?.name,
        albumUrl: track.album?.external_urls?.spotify,
        duration: formatDuration(durationMs),
        durationMs,
        filePath: track.uri,
        fileName: track.name ?? track.uri,
        thumbnail: track.album?.images?.[0]?.url,
        addedAt: addedAt ? Date.parse(addedAt) : undefined,
        provider: "spotify",
        uri: track.uri,
    };
}

async function loadProfile(): Promise<void> {
    const response = await spotifyFetch("/me", {}, "loading your profile");
    const profile = await response.json() as { display_name?: string; email?: string; id?: string; product?: string };
    spotifySettings().assign({
        displayName: profile.display_name ?? profile.email ?? profile.id ?? "Spotify",
        product: profile.product ?? "",
    });
    updateStatus();
}

async function completeLogin(url: string): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol !== "legendmusic:" || parsed.hostname !== "spotify-auth-callback") return;
    const authError = parsed.searchParams.get("error");
    if (authError) {
        throw new Error(`Spotify sign-in was cancelled or denied (${authError}). Try Connect again in Settings → Spotify.`);
    }
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");
    const settings = spotifySettings().peek();
    if (!code || !state || !settings?.codeVerifier || state !== settings.codeState) {
        throw new Error("Spotify returned an invalid sign-in callback. Start Connect again from Settings → Spotify.");
    }
    spotifyStatus$.isLoading.set(true);
    try {
        const token = await fetchToken({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: settings.codeVerifier,
        });
        spotifySettings().assign({
            accessToken: token.access_token,
            refreshToken: token.refresh_token ?? "",
            expiresAt: Date.now() + token.expires_in * 1000 - 60_000,
            codeVerifier: "",
            codeState: "",
        });
        playlistsCache = [];
        playlistTracksCache.clear();
        spotifyWebPlayer$.token.set(token.access_token);
        await loadProfile();
        await refreshProviderPlaylists();
        updateStatus();
    } finally {
        spotifyStatus$.isLoading.set(false);
    }
}

async function waitForDevice(): Promise<string> {
    activatePlayer?.();
    const current = spotifyWebPlayer$.deviceId.peek();
    if (current) return current;
    return new Promise((resolve, reject) => {
        let settled = false;
        const subscription = spotifyWebPlayer$.deviceId.onChange(({ value }) => {
            if (!value || settled) return;
            settled = true;
            clearTimeout(timeout);
            subscription();
            resolve(value);
        });
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            subscription();
            reject(new Error("Spotify's player did not become ready. Keep Legend Music open, reconnect Spotify in Settings → Spotify, then try again."));
        }, 10_000);
    });
}

export function setSpotifyPlayerActivator(activate: (() => void) | null): void {
    activatePlayer = activate;
}

function emitPlayback(update: PlaybackStateUpdate): void {
    playbackHandlers.forEach((handler) => handler(update));
}

export function handleSpotifyPlayerReady(deviceId: string): void {
    spotifyWebPlayer$.assign({ deviceId, isReady: true, error: null });
}

export function handleSpotifyPlayerError(message: string): void {
    const actionable = message.toLowerCase().includes("premium")
        ? "Spotify Web Playback requires Premium. Connect a Premium account in Settings → Spotify."
        : `Spotify's player reported: ${message}. Reconnect in Settings → Spotify if it continues.`;
    spotifyWebPlayer$.assign({ error: actionable, isReady: false });
    emitPlayback({ error: actionable, isLoading: false, isPlaying: false });
}

export function handleSpotifyPlayerState(snapshot: SpotifyPlayerSnapshot | null): void {
    if (!snapshot) {
        const didComplete = spotifyWasPlaying && Date.now() >= suppressCompletionUntil;
        spotifyWasPlaying = false;
        if (didComplete) emitPlayback({ isPlaying: false, didComplete: true, isLoading: false });
        return;
    }
    const track = snapshot.track_window?.current_track;
    const isPlaying = snapshot.paused === false;
    const position = (snapshot.position ?? 0) / 1000;
    const duration = (snapshot.duration ?? track?.duration_ms ?? 0) / 1000;
    const didComplete = spotifyWasPlaying
        && !isPlaying
        && Date.now() >= suppressCompletionUntil
        && duration > 0
        && (position <= 0.5 || position >= duration - 1);
    spotifyWasPlaying = isPlaying;
    emitPlayback({
        isPlaying,
        positionSeconds: position,
        durationSeconds: duration,
        artwork: track?.album?.images?.[0]?.url,
        isLoading: false,
        error: null,
        didComplete,
    });
}

const spotifyPlayback = {
    id: "spotify" as const,
    startsPlaybackOnLoad: true,
    async load(track: LocalTrack, startPositionSeconds = 0) {
        const uri = track.uri ?? track.filePath;
        if (!uri.startsWith("spotify:")) {
            throw new Error("This Spotify track has an invalid URI. Search for it again, then retry playback.");
        }
        spotifyWasPlaying = false;
        suppressCompletionUntil = Date.now() + 2500;
        emitPlayback({ isLoading: true, error: null });
        const deviceId = await waitForDevice();
        await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
            method: "PUT",
            body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(startPositionSeconds * 1000)) }),
        }, "starting playback");
    },
    async play() {
        const deviceId = await waitForDevice();
        await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" }, "resuming playback");
    },
    async pause() {
        await spotifyFetch("/me/player/pause", { method: "PUT" }, "pausing playback");
    },
    async seek(positionSeconds: number) {
        await spotifyFetch(`/me/player/seek?position_ms=${Math.max(0, Math.round(positionSeconds * 1000))}`, { method: "PUT" }, "seeking");
    },
    async setVolume(volume: number) {
        await spotifyFetch(`/me/player/volume?volume_percent=${Math.round(Math.max(0, Math.min(1, volume)) * 100)}`, { method: "PUT" }, "changing volume");
    },
    async stop() {
        try {
            await spotifyFetch("/me/player/pause", { method: "PUT" }, "stopping playback");
        } catch {
            // The device may already be gone while switching providers.
        }
    },
    subscribe(handler: (update: PlaybackStateUpdate) => void) {
        playbackHandlers.add(handler);
        return () => playbackHandlers.delete(handler);
    },
};

export const spotifyProvider: StreamingProvider = {
    id: "spotify",
    name: "Spotify",
    status$: spotifyStatus$,
    playback: spotifyPlayback,
    async initialize() {
        updateStatus();
        if (!linkingSubscription) {
            linkingSubscription = Linking.addEventListener("url", ({ url }) => {
                void completeLogin(url).catch((error) => {
                    const message = error instanceof Error ? error.message : "Spotify sign-in failed.";
                    updateStatus(message);
                });
            });
        }
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) await completeLogin(initialUrl);
        if (spotifyStatus$.authenticated.peek()) {
            try {
                await ensureSpotifyAccessToken();
                await loadProfile();
                await this.listPlaylists();
            } catch (error) {
                updateStatus(error instanceof Error ? error.message : "Spotify initialization failed.");
            }
        }
    },
    async login() {
        if (!spotifySettings().enabled.peek()) {
            throw new Error("Enable Spotify in Settings → Spotify before connecting your account.");
        }
        const clientId = spotifySettings().clientId.peek()?.trim();
        if (!clientId) {
            throw new Error("Add a Spotify Client ID in Settings → Spotify. In Spotify's dashboard, register legendmusic://spotify-auth-callback as the redirect URI.");
        }
        const pkce = await createPKCE();
        spotifySettings().assign({ codeVerifier: pkce.verifier, codeState: pkce.state });
        const params = encodeForm({
            client_id: clientId,
            response_type: "code",
            redirect_uri: REDIRECT_URI,
            code_challenge_method: "S256",
            code_challenge: pkce.challenge,
            scope: SCOPES.join(" "),
            state: pkce.state,
        });
        await Linking.openURL(`https://accounts.spotify.com/authorize?${params}`);
    },
    async logout() {
        await spotifyPlayback.stop();
        spotifySettings().assign({
            accessToken: "",
            refreshToken: "",
            expiresAt: 0,
            displayName: "",
            product: "",
            codeVerifier: "",
            codeState: "",
        });
        spotifyWebPlayer$.assign({ deviceId: "", isReady: false, token: "", error: null });
        playlistsCache = [];
        playlistTracksCache.clear();
        updateStatus();
    },
    async search(query: string, limit = 20) {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const response = await spotifyFetch(`/search?type=track&limit=${Math.max(1, Math.min(50, limit))}&q=${encodeURIComponent(trimmed)}`, {}, "searching");
        const json = await response.json() as { tracks?: { items?: SpotifyTrack[] } };
        return (json.tracks?.items ?? []).map((track) => mapSpotifyTrack(track)).filter((track): track is LocalTrack => Boolean(track));
    },
    async listPlaylists(force = false) {
        if (!force && playlistsCache.length > 0) return playlistsCache;
        const playlists: ProviderPlaylist[] = [];
        let next: string | null = "/me/playlists?limit=50";
        while (next) {
            const response = next.startsWith("http")
                ? await fetch(next, { headers: { Authorization: `Bearer ${await ensureSpotifyAccessToken()}` } })
                : await spotifyFetch(next, {}, "loading playlists");
            if (!response.ok) throw actionableSpotifyError(response.status, "loading playlists", await response.text());
            const json = await response.json() as {
                items?: Array<{ id: string; name: string; owner?: { display_name?: string }; tracks?: { total?: number }; images?: SpotifyImage[] }>;
                next?: string | null;
            };
            playlists.push(...(json.items ?? []).map((playlist) => ({
                provider: "spotify" as const,
                id: playlist.id,
                name: playlist.name,
                owner: playlist.owner?.display_name,
                trackCount: playlist.tracks?.total ?? 0,
                artwork: playlist.images?.[0]?.url,
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
        let next: string | null = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;
        while (next) {
            const response = next.startsWith("http")
                ? await fetch(next, { headers: { Authorization: `Bearer ${await ensureSpotifyAccessToken()}` } })
                : await spotifyFetch(next, {}, "loading playlist tracks");
            if (!response.ok) throw actionableSpotifyError(response.status, "loading playlist tracks", await response.text());
            const json = await response.json() as { items?: Array<{ added_at?: string | null; track?: SpotifyTrack | null }>; next?: string | null };
            for (const item of json.items ?? []) {
                const mapped = item.track ? mapSpotifyTrack(item.track, item.added_at) : null;
                if (mapped) tracks.push(mapped);
            }
            next = json.next ?? null;
        }
        playlistTracksCache.set(playlistId, tracks);
        return tracks;
    },
};

settings$.providers.spotify.enabled.onChange(() => updateStatus());
