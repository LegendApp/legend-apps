import type { Observable } from "@legendapp/state";
import type { LocalTrack } from "../systems/LocalMusicState";
import type { MusicProviderId } from "../systems/Settings";

export type ProviderStatus = {
    enabled: boolean;
    authenticated: boolean;
    displayName: string;
    detail: string;
    error: string | null;
    isLoading: boolean;
};

export type ProviderPlaylist = {
    provider: Exclude<MusicProviderId, "local">;
    id: string;
    name: string;
    owner?: string;
    trackCount: number;
    artwork?: string;
};

export type PlaybackStateUpdate = {
    isPlaying?: boolean;
    positionSeconds?: number;
    durationSeconds?: number;
    artwork?: string;
    isLoading?: boolean;
    error?: string | null;
    didComplete?: boolean;
};

export type PlaybackProvider = {
    id: Exclude<MusicProviderId, "local">;
    startsPlaybackOnLoad: boolean;
    load(track: LocalTrack, startPositionSeconds?: number): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(positionSeconds: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    stop(): Promise<void>;
    subscribe(handler: (update: PlaybackStateUpdate) => void): () => void;
};

export type StreamingProvider = {
    id: Exclude<MusicProviderId, "local">;
    name: string;
    status$: Observable<ProviderStatus>;
    initialize(): Promise<void>;
    login(): Promise<void>;
    logout(): Promise<void>;
    search(query: string, limit?: number): Promise<LocalTrack[]>;
    listPlaylists(force?: boolean): Promise<ProviderPlaylist[]>;
    listPlaylistTracks(playlistId: string): Promise<LocalTrack[]>;
    playback: PlaybackProvider;
};
