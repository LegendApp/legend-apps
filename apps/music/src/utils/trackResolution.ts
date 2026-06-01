import { getArtistKey, type LibraryItem, type LibraryTrack } from "@/systems/LibraryState";
import type { LocalTrack } from "@/systems/LocalMusicState";
import { DEFAULT_LOCAL_PLAYLIST_ID } from "@/systems/localMusicConstants";

export interface PlaylistResolutionSource {
    id: string;
    name?: string;
    type?: string;
    trackPaths?: string[];
}

export interface PlaylistResolutionResult {
    tracks: LocalTrack[];
    missingPaths: string[];
}

export function resolvePlaylistTracks(
    source: PlaylistResolutionSource,
    allTracks: LocalTrack[],
    trackLookup: Map<string, LocalTrack>,
): PlaylistResolutionResult {
    if (source.type === "local-files" || source.id === DEFAULT_LOCAL_PLAYLIST_ID) {
        return {
            tracks: allTracks,
            missingPaths: [],
        };
    }

    const trackPaths = source.trackPaths ?? [];
    if (trackPaths.length === 0) {
        return {
            tracks: [],
            missingPaths: [],
        };
    }

    const resolvedTracks: LocalTrack[] = [];
    const missingPaths: string[] = [];

    for (const path of trackPaths) {
        const track = trackLookup.get(path);
        if (track) {
            resolvedTracks.push(track);
        } else {
            missingPaths.push(path);
        }
    }

    return {
        tracks: resolvedTracks,
        missingPaths,
    };
}

export interface LibraryItemTracksOptions {
    allTracksPlaylistId?: string;
}

export function getTracksForLibraryItem(
    tracks: LibraryTrack[],
    item: LibraryItem | null,
    options: LibraryItemTracksOptions = {},
): LibraryTrack[] {
    if (!item) {
        return [];
    }

    if (item.children?.length) {
        const childIds = new Set(item.children.map((child) => child.id));
        return tracks.filter((track) => childIds.has(track.id));
    }

    switch (item.type) {
        case "artist":
            return tracks.filter((track) => {
                const targetArtistKey = getArtistKey(item.name);
                const trackArtistKey = getArtistKey(track.artist);
                return trackArtistKey === targetArtistKey;
            });
        case "album": {
            const albumName = item.album ?? item.name ?? "Unknown Album";
            return tracks.filter((track) => (track.album ?? "Unknown Album") === albumName);
        }
        case "playlist":
            if (options.allTracksPlaylistId && item.id === options.allTracksPlaylistId) {
                return tracks;
            }
            return tracks;
        case "track":
            return tracks.filter((track) => track.id === item.id);
        default:
            return [];
    }
}

export function buildTrackLookup(tracks: LocalTrack[]): Map<string, LocalTrack> {
    return new Map(tracks.map((track) => [track.filePath, track]));
}
