import { File } from "expo-file-system/next";
import { DEBUG_QUEUE_LOGS } from "../systems/constants";
import type { LocalTrack } from "../systems/LocalMusicState";
import { ensureCacheDirectory, getCacheDirectory, getPlaylistsDirectory } from "./cacheDirectories";
import { formatSecondsToMmSs, type M3UTrack, parseDurationToSeconds, parseM3U, writeM3U } from "./m3u";

const QUEUE_FILE_PATH = "queue.m3u";
const THUMBNAILS_DIRECTORY = getCacheDirectory("thumbnails");
const THUMBNAILS_BASE_URI = THUMBNAILS_DIRECTORY.uri.endsWith("/")
    ? THUMBNAILS_DIRECTORY.uri
    : `${THUMBNAILS_DIRECTORY.uri}/`;

const isAbsoluteOrRemotePath = (value: string): boolean =>
    value.startsWith("/") || value.startsWith("file://") || /^[a-z][a-z0-9+.-]*:/i.test(value);

const stripThumbnailBase = (logo?: string): string | undefined => {
    if (!logo) {
        return undefined;
    }

    if (logo.startsWith(THUMBNAILS_BASE_URI)) {
        return logo.slice(THUMBNAILS_BASE_URI.length);
    }

    return logo;
};

const resolveThumbnailBase = (logo?: string): string | undefined => {
    if (!logo) {
        return undefined;
    }

    if (isAbsoluteOrRemotePath(logo)) {
        return logo;
    }

    return `${THUMBNAILS_BASE_URI}${logo}`;
};

/**
 * Converts LocalTrack to M3UTrack
 */
function localTrackToM3UTrack(track: LocalTrack): M3UTrack {
    // Convert duration from "mm:ss" format to seconds
    const durationSeconds = parseDurationToSeconds(track.duration);
    const filePath = track.filePath;

    return {
        id: filePath,
        duration: Number.isFinite(durationSeconds) ? durationSeconds : -1,
        title: track.title,
        artist: track.artist,
        filePath,
        logo: stripThumbnailBase(track.thumbnail),
    };
}

/**
 * Converts M3UTrack to LocalTrack
 */
function m3uTrackToLocalTrack(track: M3UTrack): LocalTrack {
    const durationSeconds = Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;
    const durationString = durationSeconds > 0 ? formatSecondsToMmSs(durationSeconds) : " ";
    const normalizedPath = track.filePath.toLowerCase();
    const isSpotify = normalizedPath.startsWith("spotify:");
    const isAppleMusic = normalizedPath.startsWith("applemusic:");
    const fallbackTitle = track.title || track.filePath.split("/").pop() || track.filePath;
    const fileName = isSpotify || isAppleMusic ? fallbackTitle : track.filePath.split("/").pop() || track.filePath;

    return {
        id: track.filePath,
        title: fallbackTitle,
        artist: track.artist || "Unknown Artist",
        duration: durationString,
        filePath: track.filePath,
        fileName,
        thumbnail: resolveThumbnailBase(track.logo),
        addedAt: track.addedAt,
        provider: isSpotify ? "spotify" : isAppleMusic ? "appleMusic" : undefined,
        uri: isSpotify || isAppleMusic ? track.filePath : undefined,
        durationMs: durationSeconds > 0 ? durationSeconds * 1000 : undefined,
    };
}

/**
 * Saves tracks to queue.m3u file
 */
export async function saveQueueToM3U(tracks: LocalTrack[]): Promise<void> {
    try {
        const m3uTracks = tracks.map(localTrackToM3UTrack);
        const playlist = { songs: m3uTracks, suggestions: [] };
        const m3uContent = writeM3U(playlist);

        const directory = getPlaylistsDirectory();
        ensureCacheDirectory(directory);

        const file = new File(directory, QUEUE_FILE_PATH);
        file.write(m3uContent);
        if (DEBUG_QUEUE_LOGS) {
            console.log(`Saved queue with ${tracks.length} tracks to ${QUEUE_FILE_PATH}`);
        }
    } catch (error) {
        console.error("Failed to save queue to M3U:", error);
    }
}

/**
 * Loads tracks from queue.m3u file
 */
export function loadQueueFromM3U(): LocalTrack[] {
    try {
        const directory = getPlaylistsDirectory();
        ensureCacheDirectory(directory);
        const file = new File(directory, QUEUE_FILE_PATH);

        if (!file.exists) {
            if (DEBUG_QUEUE_LOGS) {
                console.log("No queue.m3u file found, starting with empty queue");
            }
            return [];
        }

        const content = file.textSync();
        const playlist = parseM3U(content);
        const tracks = playlist.songs.map(m3uTrackToLocalTrack);

        if (DEBUG_QUEUE_LOGS) {
            console.log(`Loaded queue with ${tracks.length} tracks from ${QUEUE_FILE_PATH}`);
        }
        return tracks;
    } catch (error) {
        console.error("Failed to load queue from M3U:", error);
        return [];
    }
}

/**
 * Deletes the queue.m3u file
 */
export async function clearQueueM3U(): Promise<void> {
    try {
        const directory = getPlaylistsDirectory();
        ensureCacheDirectory(directory);
        const file = new File(directory, QUEUE_FILE_PATH);
        if (file.exists) {
            file.delete();
            if (DEBUG_QUEUE_LOGS) {
                console.log("Cleared queue.m3u file");
            }
        }
    } catch (error) {
        console.error("Failed to clear queue M3U:", error);
    }
}
