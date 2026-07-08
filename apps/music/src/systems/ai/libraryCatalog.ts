import type { LocalTrack } from "../LocalMusicState";

export type PlaylistAICatalogEntry = {
    filePath: string;
    title: string;
    artist: string;
    album?: string;
};

export type PlaylistAICatalog = {
    jsonLines: string;
    count: number;
    omittedCount: number;
};

export type BuildPlaylistAICatalogOptions = {
    excludePaths?: string[];
    maxTracks?: number;
};

const defaultMaxCatalogTracks = 1200;

export function normalizeTrackPath(path: string): string {
    const withoutPrefix = path.startsWith("file://") ? path.slice("file://".length) : path;
    return withoutPrefix.trim().replace(/\/+$/, "").toLowerCase();
}

function toCatalogEntry(track: LocalTrack): PlaylistAICatalogEntry | null {
    const filePath = track.filePath.trim();
    if (!filePath) {
        return null;
    }

    return {
        filePath,
        title: track.title.trim() || track.fileName.trim() || filePath.split("/").pop() || filePath,
        artist: track.artist.trim() || "Unknown Artist",
        album: track.album?.trim() || undefined,
    };
}

export function buildPlaylistAICatalog(
    tracks: LocalTrack[],
    { excludePaths = [], maxTracks = defaultMaxCatalogTracks }: BuildPlaylistAICatalogOptions = {},
): PlaylistAICatalog {
    const excluded = new Set(excludePaths.map(normalizeTrackPath).filter(Boolean));
    const seen = new Set<string>();
    const entries: PlaylistAICatalogEntry[] = [];

    for (const track of tracks) {
        const entry = toCatalogEntry(track);
        if (!entry) {
            continue;
        }

        const key = normalizeTrackPath(entry.filePath);
        if (!key || seen.has(key) || excluded.has(key)) {
            continue;
        }

        seen.add(key);
        if (entries.length < maxTracks) {
            entries.push(entry);
        }
    }

    return {
        jsonLines: entries.map((entry) => JSON.stringify(entry)).join("\n"),
        count: entries.length,
        omittedCount: Math.max(0, seen.size - entries.length),
    };
}
