import { batch, observable } from "@legendapp/state";
import { Directory, File } from "expo-file-system/next";
import { addDirectoryChangeListener, setWatchedDirectories } from "@legend-desktop/file-system-watcher";
import {
    addMediaLibraryScannerListener,
    scanMediaLibrary,
    type MediaScanBatchEvent,
    type MediaScanProgressEvent,
    type MediaScanResult,
    type NativeScannedPlaylist,
} from "@legend-desktop/media-library-scanner";
import { readMediaTags } from "@legend-desktop/media-tags";
import { isSupportedAudioFile, SUPPORTED_AUDIO_EXTENSIONS, stripSupportedAudioExtension } from "@/systems/audioFormats";
import { DEBUG_LOCAL_MUSIC_LOGS } from "@/systems/constants";
import {
    clearLibraryCache,
    getLibrarySnapshot,
    hasCachedLibraryData,
    type PersistedLibraryTrack,
} from "@/systems/LibraryCache";
import { settings$ } from "@/systems/Settings";
import { stateSaved$ } from "@/systems/State";
import { ensureCacheDirectory, getCacheDirectory, getPlaylistsDirectory } from "@/utils/cacheDirectories";
import { type M3UTrack, parseM3U, writeM3U } from "@/utils/m3u";
import { loadQueueFromM3U } from "@/utils/m3uManager";
import { perfCount, perfLog } from "@/utils/perfLogger";
import { runAfterInteractions, runAfterInteractionsWithLabel } from "@/utils/runAfterInteractions";
import { buildThumbnailUri } from "@/utils/thumbnails";
import { DEFAULT_LOCAL_PLAYLIST_ID } from "./localMusicConstants";

export interface LocalTrack {
    id: string;
    title: string;
    artist: string;
    album?: string;
    trackNumber?: number;
    duration: string;
    filePath: string;
    fileName: string;
    thumbnail?: string;
    thumbnailKey?: string;
    addedAt?: number;
    isMissing?: boolean;
    provider?: string;
    uri?: string;
    durationMs?: number;
}

export interface LocalPlaylist {
    id: string;
    name: string;
    filePath: string;
    trackPaths: string[];
    tracks?: M3UTrack[];
    trackCount: number;
    source: "cache" | "library-folder";
    originRoot?: string;
}

export interface LocalMusicState {
    tracks: LocalTrack[];
    isScanning: boolean;
    scanProgress: number;
    scanTotal: number;
    scanTrackProgress: number;
    scanTrackTotal: number;
    error: string | null;
    isLocalFilesSelected: boolean;
    playlists: LocalPlaylist[];
    thumbnailVersion: number;
}

export { DEFAULT_LOCAL_PLAYLIST_ID, DEFAULT_LOCAL_PLAYLIST_NAME } from "./localMusicConstants";

export const librarySettings$ = settings$.library;

// Runtime state
export const localMusicState$ = observable<LocalMusicState>({
    tracks: [],
    isScanning: false,
    scanProgress: 0,
    scanTotal: 0,
    scanTrackProgress: 0,
    scanTrackTotal: 0,
    error: null,
    isLocalFilesSelected: false,
    playlists: [],
    thumbnailVersion: 0,
});

const FILE_WATCH_DEBOUNCE_MS = 2000;
let pendingUserInitiatedLibraryChange = false;

let removeLibraryWatcher: { remove(): void } | undefined;
let libraryWatcherTimeout: ReturnType<typeof setTimeout> | undefined;
let hasSubscribedToLibraryPathChanges = false;
let lastLibraryPaths: string[] = [];
type DiscoveredPlaylist = {
    filePath: string;
    originRoot: string;
    fileName: string;
};
let lastDiscoveredLibraryPlaylists: DiscoveredPlaylist[] = [];

const setDiscoveredLibraryPlaylists = (playlists: DiscoveredPlaylist[]): void => {
    const seen = new Set<string>();
    const deduped: DiscoveredPlaylist[] = [];

    for (const playlist of playlists) {
        const normalizedPath = normalizeRootPath(playlist.filePath);
        if (!normalizedPath) {
            continue;
        }

        const key = normalizedPath.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        deduped.push({
            ...playlist,
            filePath: normalizedPath,
            originRoot: normalizeRootPath(playlist.originRoot),
        });
    }

    lastDiscoveredLibraryPlaylists = deduped;
};

const debugLocalMusicLog = (...args: unknown[]) => {
    if (DEBUG_LOCAL_MUSIC_LOGS) {
        console.log(...args);
    }
};

const bumpThumbnailVersion = (): number => {
    const version = Date.now();
    localMusicState$.thumbnailVersion.set(version);
    return version;
};

function clearCachedLibraryData(): void {
    clearLibraryCache();
    librarySettings$.lastScanTime.set(0);
    localMusicState$.tracks.set([]);
    localMusicState$.scanTrackProgress.set(0);
    localMusicState$.scanTrackTotal.set(0);
}

function scheduleScanAfterFileChange(delayMs = FILE_WATCH_DEBOUNCE_MS): void {
    if (libraryWatcherTimeout) {
        clearTimeout(libraryWatcherTimeout);
    }

    libraryWatcherTimeout = setTimeout(
        () => {
            libraryWatcherTimeout = undefined;

            if (localMusicState$.isScanning.get()) {
                scheduleScanAfterFileChange(delayMs);
                return;
            }

            debugLocalMusicLog("Rescanning local music after filesystem change");
            scanLocalMusic().catch((error) => {
                console.error("Failed to rescan local music after filesystem change:", error);
            });
        },
        Math.max(0, delayMs),
    );
}

function configureLibraryPathWatcher(paths: string[]): void {
    try {
        setWatchedDirectories(paths);
    } catch (error) {
        console.error("Failed to configure filesystem watcher for local music:", error);
        return;
    }

    if (paths.length === 0) {
        if (removeLibraryWatcher) {
            removeLibraryWatcher.remove();
            removeLibraryWatcher = undefined;
        }
        return;
    }

    if (!removeLibraryWatcher) {
        removeLibraryWatcher = addDirectoryChangeListener(() => {
            scheduleScanAfterFileChange();
        });
    }
}

function fileNameFromPath(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function normalizeRootPath(path: string): string {
    if (!path) {
        return "";
    }

    const withoutPrefix = path.startsWith("file://") ? path.replace("file://", "") : path;
    const trimmed = withoutPrefix.replace(/\/+$/, "");
    return trimmed.length > 0 ? trimmed : withoutPrefix;
}

function validateLibraryPaths(paths: string[]): { existing: string[]; missing: string[] } {
    if (paths.length === 0) {
        return { existing: [], missing: [] };
    }

    const existing: string[] = [];
    const missing: string[] = [];

    for (const path of paths) {
        try {
            const directory = new Directory(path);
            if (directory.exists) {
                existing.push(path);
            } else {
                missing.push(path);
            }
        } catch (error) {
            console.warn(`validateLibraryPaths: failed to inspect ${path}`, error);
            missing.push(path);
        }
    }

    return { existing, missing };
}

function dedupeTracksByPath(tracks: LocalTrack[]): LocalTrack[] {
    const unique = new Map<string, LocalTrack>();

    for (const track of tracks) {
        const normalizedPath = normalizeRootPath(track.filePath || track.id);
        if (!normalizedPath) {
            continue;
        }

        const key = normalizedPath.toLowerCase();
        if (unique.has(key)) {
            continue;
        }

        unique.set(key, {
            ...track,
            id: track.id || normalizedPath,
            filePath: normalizedPath,
            fileName: track.fileName ?? fileNameFromPath(normalizedPath),
        });
    }

    return Array.from(unique.values());
}

function buildAbsolutePath(rootPath: string, relativePath: string): string {
    if (relativePath.startsWith("/")) {
        return relativePath;
    }

    const normalizedRoot = normalizeRootPath(rootPath);
    if (normalizedRoot.endsWith("/")) {
        return `${normalizedRoot}${relativePath}`;
    }

    return `${normalizedRoot}/${relativePath}`;
}

function isLocalFileUri(uri: string): boolean {
    return uri.startsWith("file://") || uri.startsWith("/");
}

function thumbnailFileExists(uri: string): boolean {
    try {
        const thumbnailFile = new File(uri);
        return thumbnailFile.exists;
    } catch (error) {
        console.warn(`ensureLocalTrackThumbnail: Failed to check thumbnail at ${uri}:`, error);
        return false;
    }
}

function buildCachedTrackIndex(normalizedRoots: string[]): {
    skipEntries: { rootIndex: number; relativePath: string }[];
    cachedTracksByRoot: Map<number, Map<string, PersistedLibraryTrack>>;
    cachedTrackCount: number;
} {
    const snapshot = getLibrarySnapshot();
    const snapshotTracks = Array.isArray(snapshot.tracks) ? snapshot.tracks : [];
    const cachedTrackCount = snapshotTracks.length;
    if (cachedTrackCount === 0) {
        return { skipEntries: [], cachedTracksByRoot: new Map(), cachedTrackCount: 0 };
    }

    const snapshotRoots = Array.isArray(snapshot.roots)
        ? snapshot.roots.map((root) => normalizeRootPath(root)).filter(Boolean)
        : [];

    const skipEntries: { rootIndex: number; relativePath: string }[] = [];
    const cachedTracksByRoot = new Map<number, Map<string, PersistedLibraryTrack>>();
    const seen = new Set<string>();

    normalizedRoots.forEach((rootPath, currentRootIndex) => {
        const snapshotRootIndex = snapshotRoots.indexOf(rootPath);
        if (snapshotRootIndex === -1) {
            return;
        }

        const tracksForRoot = snapshotTracks.filter((track) => track.root === snapshotRootIndex);
        if (tracksForRoot.length === 0) {
            return;
        }

        const map = new Map<string, PersistedLibraryTrack>();
        for (const track of tracksForRoot) {
            const relativePath = track.rel ?? "";
            if (!relativePath) {
                continue;
            }
            map.set(relativePath, track);
            const cacheKey = `${currentRootIndex}:${relativePath}`;
            if (!seen.has(cacheKey)) {
                skipEntries.push({ rootIndex: currentRootIndex, relativePath });
                seen.add(cacheKey);
            }
        }

        if (map.size > 0) {
            cachedTracksByRoot.set(currentRootIndex, map);
        }
    });

    return { skipEntries, cachedTracksByRoot, cachedTrackCount };
}

export async function ensureLocalTrackThumbnail(track: LocalTrack): Promise<string | undefined> {
    const thumbnailUri = track.thumbnail;
    const hasLocalThumbnail = thumbnailUri?.length && isLocalFileUri(thumbnailUri);
    const missingLocalThumbnail = Boolean(
        thumbnailUri?.length && hasLocalThumbnail && !thumbnailFileExists(thumbnailUri),
    );

    let returnValue: string | undefined;

    if (thumbnailUri?.length && !missingLocalThumbnail) {
        returnValue = thumbnailUri;
    }

    if (!returnValue) {
        if (missingLocalThumbnail) {
            track.thumbnail = undefined;
        }

        const thumbnailsDir = getCacheDirectory("thumbnails");
        ensureCacheDirectory(thumbnailsDir);

        const fromKey = buildThumbnailUri(track.thumbnailKey);
        if (fromKey && thumbnailFileExists(fromKey)) {
            track.thumbnail = fromKey;
            bumpThumbnailVersion();
            returnValue = fromKey;
        }
    }

    if (!returnValue) {
        try {
            const metadata = await extractId3Metadata(track.filePath, track.fileName);
            if (metadata.thumbnail) {
                track.thumbnail = metadata.thumbnail;
                returnValue = metadata.thumbnail;
            }
            if (metadata.duration && (!track.duration || track.duration.trim().length === 0)) {
                track.duration = metadata.duration;
            }
            if (metadata.trackNumber != null && (!track.trackNumber || track.trackNumber <= 0)) {
                track.trackNumber = metadata.trackNumber;
            }
        } catch (error) {
            console.warn(`ensureLocalTrackThumbnail: Failed to resolve thumbnail for ${track.fileName}:`, error);
            return undefined;
        }
    }

    bumpThumbnailVersion();
    return returnValue;
}

// Extract metadata from ID3 tags with filename fallback
async function extractId3Metadata(
    filePath: string,
    fileName: string,
): Promise<{
    title: string;
    artist: string;
    album?: string;
    trackNumber?: number;
    duration?: string;
    thumbnail?: string;
}> {
    perfCount("LocalMusic.extractId3Metadata");

    const fallback = parseFilenameOnly(fileName);
    let title = fallback.title;
    let artist = fallback.artist;
    let album: string | undefined;
    let trackNumber: number | undefined;
    let duration: string | undefined;
    let thumbnail: string | undefined;

    const thumbnailsDir = getCacheDirectory("thumbnails");
    ensureCacheDirectory(thumbnailsDir);

    const thumbnailsDirUri = thumbnailsDir.uri;

    // console.log("extractId3Metadata", thumbnailsDirUri);

    try {
        const nativeTags = await readMediaTags(filePath, { cacheDir: thumbnailsDirUri, includeArtwork: true });
        if (nativeTags) {
            if (nativeTags.title?.trim()) {
                title = nativeTags.title;
            }
            if (nativeTags.artist?.trim()) {
                artist = nativeTags.artist;
            }
            if (nativeTags.album?.trim()) {
                album = nativeTags.album;
            }
            trackNumber = normalizeTrackNumber(nativeTags.trackNumber);
            if (Number.isFinite(nativeTags.durationSeconds) && nativeTags.durationSeconds! > 0) {
                duration = formatDuration(nativeTags.durationSeconds!);
            }
            const nativeThumbnailKey = nativeTags.artworkKey?.length ? nativeTags.artworkKey : undefined;
            if (nativeThumbnailKey) {
                thumbnail = buildThumbnailUri(nativeThumbnailKey) ?? thumbnail;
            }
            if (!thumbnail && nativeTags.artworkUri?.length) {
                thumbnail = nativeTags.artworkUri;
            }
        }
    } catch (error) {
        console.warn(`extractId3Metadata: Failed to read native metadata for ${fileName}:`, error);
    }

    return {
        title,
        artist,
        album,
        trackNumber,
        duration,
        thumbnail,
    };
}

// Fallback: Extract metadata from filename (original logic)
function parseFilenameOnly(fileName: string): {
    title: string;
    artist: string;
} {
    // Remove extension
    let name = stripSupportedAudioExtension(fileName);

    // Decode URL-encoded characters (like %20 for spaces)
    try {
        name = decodeURIComponent(name);
    } catch (error) {
        // If decoding fails, use the original name
        console.warn(`Failed to decode filename: ${fileName}`, error);
    }

    // Try to parse "Artist - Title" format
    if (name.includes(" - ")) {
        const parts = name.split(" - ");
        const artist = parts[0].trim();
        const title = parts.slice(1).join(" - ").trim();
        return {
            title: title,
            artist: artist,
        };
    }

    // If no artist separator, use filename as title
    return {
        title: name.trim(),
        artist: "Unknown Artist",
    };
}

// Format duration from seconds to MM:SS format
function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

const normalizeTrackNumber = (value: unknown): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }

    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : undefined;
};

/**
 * Creates a LocalTrack for an arbitrary audio file path by reusing the ID3 and native metadata pipeline.
 */
export async function createLocalTrackFromFile(filePath: string): Promise<LocalTrack> {
    const fileName = fileNameFromPath(filePath);

    if (!isSupportedAudioFile(filePath)) {
        throw new Error(`Unsupported audio format for ${fileName}`);
    }

    try {
        const metadata = await extractId3Metadata(filePath, fileName);
        const duration = metadata.duration ?? "0:00";

        return {
            id: filePath,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            trackNumber: metadata.trackNumber,
            duration,
            thumbnail: metadata.thumbnail,
            filePath,
            fileName,
        };
    } catch (error) {
        console.error(`Failed to create LocalTrack from ${fileName}:`, error);

        const fallback = parseFilenameOnly(fileName);
        return {
            id: filePath,
            title: fallback.title,
            artist: fallback.artist,
            duration: "0:00",
            filePath,
            fileName,
        };
    }
}

export async function loadTracksForDirectories(directories: string[]): Promise<LocalTrack[]> {
    const normalizedDirectories = Array.from(
        new Set(
            directories
                .map((path) => normalizeRootPath(path))
                .filter((path): path is string => Boolean(path && path.length > 0)),
        ),
    );

    if (normalizedDirectories.length === 0) {
        return [];
    }

    const directoryMatchers = normalizedDirectories.map((path) => {
        const lower = path.toLowerCase();
        return lower.endsWith("/") ? lower.slice(0, -1) : lower;
    });

    const matchesDirectory = (filePath?: string): boolean => {
        if (!filePath) {
            return false;
        }
        const normalized = normalizeRootPath(filePath);
        if (!normalized) {
            return false;
        }
        const lower = normalized.toLowerCase();
        return directoryMatchers.some((directory) => lower === directory || lower.startsWith(`${directory}/`));
    };

    const tracks: LocalTrack[] = [];
    const seenPaths = new Set<string>();

    for (const track of localMusicState$.tracks.get()) {
        const normalizedPath = normalizeRootPath(track.filePath);
        if (!matchesDirectory(normalizedPath)) {
            continue;
        }

        const key = normalizedPath.toLowerCase();
        if (seenPaths.has(key)) {
            continue;
        }

        seenPaths.add(key);
        tracks.push(track);
    }

    const existingLibraryPaths = new Set(
        librarySettings$.paths
            .get()
            .map((path) => normalizeRootPath(path))
            .filter(Boolean),
    );

    const hasNewDirectories = normalizedDirectories.some((directory) => !existingLibraryPaths.has(directory));
    const shouldScanDirectories = hasNewDirectories || tracks.length === 0;

    if (!shouldScanDirectories) {
        return tracks;
    }

    const scannedTracks = await scanDirectoriesForTracks(normalizedDirectories, seenPaths, matchesDirectory);
    return [...tracks, ...scannedTracks];
}

async function scanDirectoriesForTracks(
    normalizedRoots: string[],
    seenPaths: Set<string>,
    matchesDirectory: (filePath?: string) => boolean,
): Promise<LocalTrack[]> {
    const tracks: LocalTrack[] = [];

    if (normalizedRoots.length === 0) {
        return tracks;
    }

    const handleBatch = (event: MediaScanBatchEvent) => {
        if (!event || !Array.isArray(event.tracks)) {
            return;
        }

        const rootIndex = event.rootIndex ?? -1;
        const rootPath = normalizedRoots[rootIndex];
        if (!rootPath) {
            return;
        }

        for (const nativeTrack of event.tracks) {
            const relativePath = nativeTrack.relativePath?.length ? nativeTrack.relativePath : (nativeTrack.fileName ?? "");

            if (!relativePath) {
                continue;
            }

            const absolutePath = relativePath.startsWith("/")
                ? normalizeRootPath(relativePath)
                : normalizeRootPath(buildAbsolutePath(rootPath, relativePath));

            if (!absolutePath || !isSupportedAudioFile(absolutePath) || !matchesDirectory(absolutePath)) {
                continue;
            }

            const key = absolutePath.toLowerCase();
            if (seenPaths.has(key)) {
                continue;
            }

            const fileName = nativeTrack.fileName ?? fileNameFromPath(absolutePath);
            const fallback = parseFilenameOnly(fileName);

            const title = nativeTrack.title?.trim() || fallback.title;
            const artist = nativeTrack.artist?.trim() || fallback.artist;
            const album = nativeTrack.album?.trim() || undefined;
            const trackNumber = normalizeTrackNumber(nativeTrack.trackNumber);
            const durationSeconds =
                Number.isFinite(nativeTrack.durationSeconds) && nativeTrack.durationSeconds != null
                    ? nativeTrack.durationSeconds
                    : undefined;
            const duration = durationSeconds != null ? formatDuration(durationSeconds) : "0:00";

            tracks.push({
                id: absolutePath,
                title,
                artist,
                album,
                trackNumber,
                duration,
                filePath: absolutePath,
                fileName,
            });

            seenPaths.add(key);
        }
    };

    const subscriptions = [
        addMediaLibraryScannerListener("onMediaScanBatch", handleBatch),
        addMediaLibraryScannerListener("onMediaScanComplete", () => {}),
    ];

    try {
        await scanMediaLibrary(normalizedRoots, "", {
            batchSize: 200,
            includeArtwork: false,
            allowedExtensions: SUPPORTED_AUDIO_EXTENSIONS,
        });
    } catch (error) {
        console.error("Failed to scan directories for dropped folders:", error);
    } finally {
        for (const subscription of subscriptions) {
            try {
                subscription?.remove?.();
            } catch (error) {
                console.warn("Failed to remove directory scan listener", error);
            }
        }
    }

    return tracks;
}

async function scanLibraryNative(
    paths: string[],
): Promise<{ tracks: LocalTrack[]; errors: string[]; playlists: DiscoveredPlaylist[] }> {
    if (paths.length === 0) {
        setDiscoveredLibraryPlaylists([]);
        return { tracks: [], errors: [], playlists: [] };
    }

    const normalizedRoots = paths.map((path) => normalizeRootPath(path));
    const tracks: LocalTrack[] = [];
    const scanErrors: string[] = [];
    const seenPaths = new Set<string>();
    let discoveredPlaylists: DiscoveredPlaylist[] = [];
    setDiscoveredLibraryPlaylists([]);
    const applyDiscoveredPlaylists = (nativePlaylists?: NativeScannedPlaylist[]): void => {
        if (!Array.isArray(nativePlaylists) || nativePlaylists.length === 0) {
            discoveredPlaylists = [];
            setDiscoveredLibraryPlaylists([]);
            return;
        }

        const mapped: DiscoveredPlaylist[] = [];
        const seen = new Set<string>();

        for (const playlist of nativePlaylists) {
            if (!playlist) {
                continue;
            }

            const rootIndex = Number.isFinite(playlist.rootIndex) ? playlist.rootIndex : -1;
            const originRoot = normalizedRoots[rootIndex];
            if (!originRoot) {
                continue;
            }

            const candidatePath =
                (playlist.absolutePath && playlist.absolutePath.length > 0 ? playlist.absolutePath : undefined) ??
                (playlist.relativePath?.length
                    ? buildAbsolutePath(originRoot, playlist.relativePath)
                    : buildAbsolutePath(originRoot, playlist.fileName ?? ""));

            const normalizedPath = candidatePath ? normalizeRootPath(candidatePath) : "";
            if (!normalizedPath) {
                continue;
            }

            const fileName = playlist.fileName ?? fileNameFromPath(normalizedPath);
            if (!isPlaylistFileName(fileName) || isQueuePlaylistFileName(fileName)) {
                continue;
            }

            const key = normalizedPath.toLowerCase();
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            mapped.push({
                filePath: normalizedPath,
                originRoot,
                fileName,
            });
        }

        discoveredPlaylists = mapped;
        setDiscoveredLibraryPlaylists(mapped);
    };
    const { skipEntries, cachedTracksByRoot, cachedTrackCount } = buildCachedTrackIndex(normalizedRoots);
    if (cachedTrackCount > 0) {
        localMusicState$.scanTrackTotal.set((value) => Math.max(value, cachedTrackCount));
    }

    const handleBatch = (event: MediaScanBatchEvent) => {
        if (!event || !Array.isArray(event.tracks)) {
            return;
        }

        const rootIndex = event.rootIndex ?? -1;
        const rootPath = normalizedRoots[rootIndex];
        const cachedTracks = cachedTracksByRoot.get(rootIndex);
        if (!rootPath) {
            return;
        }

        for (const nativeTrack of event.tracks) {
            const relativePath = nativeTrack.relativePath?.length
                ? nativeTrack.relativePath
                : (nativeTrack.fileName ?? "");

            if (!relativePath) {
                continue;
            }

            const absolutePath = relativePath.startsWith("/")
                ? relativePath
                : buildAbsolutePath(rootPath, relativePath);

            if (!isSupportedAudioFile(absolutePath)) {
                continue;
            }

            if (seenPaths.has(absolutePath)) {
                continue;
            }

            const fileName = nativeTrack.fileName ?? fileNameFromPath(absolutePath);
            const fallback = parseFilenameOnly(fileName);

            const cachedTrack = cachedTracks?.get(relativePath);

            const title = nativeTrack.title?.trim() || cachedTrack?.title || fallback.title;
            const artist = nativeTrack.artist?.trim() || cachedTrack?.artist || fallback.artist;
            const album = nativeTrack.album?.trim() || cachedTrack?.album || undefined;
            const trackNumber =
                normalizeTrackNumber(nativeTrack.trackNumber) ?? normalizeTrackNumber(cachedTrack?.trackNumber);

            const durationSeconds =
                Number.isFinite(nativeTrack.durationSeconds) && nativeTrack.durationSeconds != null
                    ? nativeTrack.durationSeconds
                    : undefined;

            const duration =
                durationSeconds != null ? formatDuration(durationSeconds) : (cachedTrack?.duration ?? "0:00");

            tracks.push({
                id: absolutePath,
                title,
                artist,
                album,
                trackNumber,
                duration,
                filePath: absolutePath,
                fileName,
            });

            seenPaths.add(absolutePath);
        }

        localMusicState$.scanTrackProgress.set(tracks.length);
    };

    const handleProgress = (event: MediaScanProgressEvent) => {
        const totalRoots = event.totalRoots && event.totalRoots > 0 ? event.totalRoots : normalizedRoots.length;
        const completedRoots = Math.min(totalRoots, event.completedRoots ?? event.rootIndex + 1);

        localMusicState$.scanTotal.set(totalRoots);
        localMusicState$.scanProgress.set(completedRoots);
    };

    const handleComplete = (event: MediaScanResult) => {
        const totalRoots = event.totalRoots && event.totalRoots > 0 ? event.totalRoots : normalizedRoots.length;
        const totalTracks = event.totalTracks ?? localMusicState$.scanTrackTotal.get();
        localMusicState$.scanTotal.set(totalRoots);
        localMusicState$.scanProgress.set(totalRoots);
        const finalTotal = Math.max(totalTracks ?? 0, cachedTrackCount, tracks.length);
        localMusicState$.scanTrackTotal.set(finalTotal);
        localMusicState$.scanTrackProgress.set(tracks.length);

        if (Array.isArray(event.errors) && event.errors.length > 0) {
            scanErrors.push(...(event.errors as string[]));
        }

        if (Array.isArray(event.playlists)) {
            applyDiscoveredPlaylists(event.playlists);
        }
    };

    const subscriptions = [
        addMediaLibraryScannerListener("onMediaScanBatch", handleBatch),
        addMediaLibraryScannerListener("onMediaScanProgress", handleProgress),
        addMediaLibraryScannerListener("onMediaScanComplete", handleComplete),
    ];

    try {
        const result = await scanMediaLibrary(normalizedRoots, "", {
            batchSize: 100,
            skip: skipEntries,
            includeArtwork: false,
            allowedExtensions: SUPPORTED_AUDIO_EXTENSIONS,
        });
        const totalRoots = result.totalRoots && result.totalRoots > 0 ? result.totalRoots : normalizedRoots.length;
        const totalTracks = result.totalTracks ?? localMusicState$.scanTrackTotal.get();
        localMusicState$.scanTotal.set(totalRoots);
        localMusicState$.scanProgress.set(totalRoots);
        localMusicState$.scanTrackTotal.set((value) =>
            Math.max(value, totalTracks ?? 0, cachedTrackCount, tracks.length),
        );
        localMusicState$.scanTrackProgress.set(tracks.length);
        if (Array.isArray(result.errors) && result.errors.length > 0) {
            scanErrors.push(...(result.errors as string[]));
            console.warn("Native library scan completed with errors", {
                errorCount: scanErrors.length,
                totalTracks: result.totalTracks,
                totalRoots,
                sampleErrors: scanErrors.slice(0, 5),
            });
        }
        applyDiscoveredPlaylists(result.playlists);
        return { tracks, errors: scanErrors, playlists: discoveredPlaylists };
    } finally {
        for (const subscription of subscriptions) {
            try {
                subscription?.remove?.();
            } catch (error) {
                console.warn("Failed to remove media scan listener", error);
            }
        }
    }
}

// Scan all configured library paths
export async function scanLocalMusic(): Promise<void> {
    const paths = Array.from(
        new Set(
            librarySettings$.paths
                .get()
                .map((path) => normalizeRootPath(path))
                .filter(Boolean),
        ),
    );

    if (paths.length === 0) {
        localMusicState$.scanTrackProgress.set(0);
        localMusicState$.scanTrackTotal.set(0);
        localMusicState$.error.set("No library paths configured");
        return;
    }

    const { existing: availablePaths, missing: missingPaths } = validateLibraryPaths(paths);
    if (availablePaths.length === 0) {
        localMusicState$.scanTrackProgress.set(0);
        localMusicState$.scanTrackTotal.set(0);
        localMusicState$.error.set("Library folders are unavailable. Please re-add them in Settings and try again.");
        return;
    }

    perfLog("LocalMusic.scanLocalMusic.start", { paths: availablePaths, missingPaths });
    localMusicState$.isScanning.set(true);
    localMusicState$.error.set(missingPaths.length > 0 ? `Skipping missing folders: ${missingPaths.join(", ")}` : null);
    localMusicState$.scanProgress.set(0);
    localMusicState$.scanTotal.set(availablePaths.length);
    localMusicState$.scanTrackProgress.set(0);
    localMusicState$.scanTrackTotal.set(localMusicState$.tracks.get().length);

    try {
        let collectedTracks: LocalTrack[] = [];
        let scanErrors: string[] = [];

        const nativeResult = await scanLibraryNative(availablePaths);
        collectedTracks = nativeResult.tracks;
        scanErrors = nativeResult.errors;

        const dedupedTracks = dedupeTracksByPath(collectedTracks);

        dedupedTracks.sort((a, b) => {
            const artistCompare = a.artist.localeCompare(b.artist);
            if (artistCompare !== 0) return artistCompare;
            return a.title.localeCompare(b.title);
        });

        perfLog("LocalMusic.scanLocalMusic.done", { total: dedupedTracks.length });
        localMusicState$.tracks.set(dedupedTracks);
        librarySettings$.lastScanTime.set(Date.now());
        localMusicState$.scanProgress.set(localMusicState$.scanTotal.get());
        localMusicState$.scanTrackProgress.set(dedupedTracks.length);
        localMusicState$.scanTrackTotal.set(dedupedTracks.length);

        if (scanErrors.length > 0) {
            localMusicState$.error.set(
                `Scan completed with ${scanErrors.length} metadata errors. Try rescanning or check file permissions.`,
            );
        }

        loadLocalPlaylists();
        debugLocalMusicLog(`Scan complete: Found ${dedupedTracks.length} total audio files`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        localMusicState$.error.set(`Scan failed: ${errorMessage}`);
        console.error("Local music scan failed:", error);
    } finally {
        localMusicState$.isScanning.set(false);
    }
}

export function markLibraryChangeUserInitiated(): void {
    pendingUserInitiatedLibraryChange = true;
}

const toFilePath = (value: string): string => {
    if (!value.startsWith("file://")) {
        return value;
    }

    try {
        const url = new URL(value);
        if (url.protocol === "file:") {
            return decodeURI(url.pathname);
        }
    } catch {
        // Ignore parse errors and fall through to returning the original string.
    }

    return value;
};

const decodeIfUriEncoded = (value: string): string => {
    if (!/%[0-9A-Fa-f]{2}/.test(value)) {
        return value;
    }

    try {
        return decodeURI(value);
    } catch {
        return value;
    }
};

export const sanitizePlaylistFileName = (name: string): string => {
    const trimmed = name.trim();
    const sanitized = trimmed
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim();

    return sanitized.length > 0 ? sanitized : "New Playlist";
};

const PLAYLIST_EXTENSIONS = [".m3u", ".m3u8"];
const isPlaylistFileName = (name: string): boolean => {
    const lower = name.toLowerCase();
    return PLAYLIST_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const isQueuePlaylistFileName = (name: string): boolean => name.toLowerCase() === "queue.m3u";

const directoryFromPath = (path: string): string => {
    const filePath = toFilePath(path);
    const lastSlash = filePath.lastIndexOf("/");
    return lastSlash === -1 ? filePath : filePath.slice(0, lastSlash);
};

const resolveTrackPathForPlaylist = (playlistFilePath: string, entryPath: string): string => {
    const filePath = toFilePath(entryPath);
    if (filePath.startsWith("/")) {
        return filePath;
    }

    if (filePath.toLowerCase().startsWith("spotify:")) {
        return filePath;
    }

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath)) {
        return filePath;
    }

    const baseDir = directoryFromPath(playlistFilePath);
    return `${baseDir}/${filePath}`.replace(/\/{2,}/g, "/");
};

const readPlaylistTracks = (file: File): M3UTrack[] => {
    const content = file.textSync();
    const parsed = parseM3U(content);
    return parsed.songs
        .map((track) => {
            const resolvedPath = resolveTrackPathForPlaylist(file.uri, track.filePath);
            if (!resolvedPath) {
                return null;
            }
            return {
                ...track,
                id: resolvedPath,
                filePath: resolvedPath,
            };
        })
        .filter((track): track is M3UTrack => Boolean(track));
};

export function loadLocalPlaylists(): void {
    perfLog("LocalMusic.loadLocalPlaylists.start");

    const playlistDirectory = getPlaylistsDirectory();
    ensureCacheDirectory(playlistDirectory);

    let entries: (Directory | File)[] = [];
    try {
        entries = playlistDirectory.list();
    } catch (error) {
        console.error("Failed to list playlists directory:", error);
        localMusicState$.playlists.set([]);
        return;
    }

    const cachePlaylists: LocalPlaylist[] = [];

    for (const entry of entries) {
        if (!(entry instanceof File)) {
            continue;
        }

        if (!isPlaylistFileName(entry.name)) {
            continue;
        }

        if (isQueuePlaylistFileName(entry.name)) {
            continue;
        }

        try {
            const tracks = readPlaylistTracks(entry);
            const trackPaths = tracks.map((track) => track.filePath);
            cachePlaylists.push({
                id: toFilePath(entry.uri),
                name: entry.name.replace(/\.(m3u|m3u8)$/i, ""),
                filePath: toFilePath(entry.uri),
                trackPaths,
                tracks,
                trackCount: trackPaths.length,
                source: "cache",
            });
        } catch (error) {
            console.warn(`Failed to read playlist ${entry.uri}:`, error);
        }
    }

    const discoveredPlaylists = lastDiscoveredLibraryPlaylists;
    const cachePlaylistIds = new Set(cachePlaylists.map((playlist) => playlist.id));
    const libraryPlaylists: LocalPlaylist[] = [];

    for (const discovered of discoveredPlaylists) {
        const filePath = toFilePath(discovered.filePath);
        const fileName = discovered.fileName || fileNameFromPath(filePath);
        if (!filePath || !isPlaylistFileName(fileName) || isQueuePlaylistFileName(fileName)) {
            continue;
        }

        if (cachePlaylistIds.has(filePath)) {
            continue;
        }

        try {
            const file = new File(filePath);
            if (!file.exists) {
                continue;
            }

            const tracks = readPlaylistTracks(file);
            const trackPaths = tracks.map((track) => track.filePath);
            const playlistName = fileName.replace(/\.(m3u|m3u8)$/i, "");
            libraryPlaylists.push({
                id: toFilePath(file.uri),
                name: playlistName,
                filePath: toFilePath(file.uri),
                trackPaths,
                tracks,
                trackCount: trackPaths.length,
                source: "library-folder",
                originRoot: discovered.originRoot,
            });
        } catch (error) {
            console.warn(`Failed to read library playlist ${filePath}:`, error);
        }
    }

    const playlists = [...cachePlaylists, ...libraryPlaylists];
    playlists.sort((a, b) => {
        if (a.source !== b.source) {
            return a.source === "cache" ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
    });

    localMusicState$.playlists.set(playlists);
    perfLog("LocalMusic.loadLocalPlaylists.end", { total: playlists.length });
}

export function createLocalPlaylist(name: string): LocalPlaylist {
    const desiredName = name.trim() || "New Playlist";

    const directory = getPlaylistsDirectory();
    ensureCacheDirectory(directory);
    const maxAttempts = 50;
    let playlistName = desiredName;
    let file: File | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        playlistName = attempt === 0 ? desiredName : `${desiredName} (${attempt + 1})`;
        const fileBase = sanitizePlaylistFileName(playlistName);
        const fileName = `${fileBase}.m3u`;
        const candidate = new File(directory, fileName);
        if (!candidate.exists) {
            file = candidate;
            break;
        }
    }

    if (!file) {
        throw new Error(`Unable to create playlist: too many existing playlists named "${desiredName}"`);
    }
    file.write("#EXTM3U\n");

    const filePath = toFilePath(file.uri);
    const playlist: LocalPlaylist = {
        id: filePath,
        name: playlistName,
        filePath,
        trackPaths: [],
        tracks: [],
        trackCount: 0,
        source: "cache",
    };

    const currentPlaylists = localMusicState$.playlists.peek();
    const nextPlaylists = [...currentPlaylists, playlist].filter((pl) => !pl.id.startsWith("pl-temp-"));
    nextPlaylists.sort((a, b) => a.name.localeCompare(b.name));
    localMusicState$.playlists.set(nextPlaylists);

    return playlist;
}

export function saveLocalPlaylistTracks(
    playlist: LocalPlaylist,
    trackPaths: string[],
    trackEntries?: M3UTrack[],
): void {
    try {
        const entryBuckets = new Map<string, M3UTrack[]>();
        const seedEntries = trackEntries ?? playlist.tracks ?? [];
        for (const entry of seedEntries) {
            const key = entry.filePath;
            const bucket = entryBuckets.get(key);
            if (bucket) {
                bucket.push(entry);
            } else {
                entryBuckets.set(key, [entry]);
            }
        }

        const now = Date.now();
        const m3uTracks = trackPaths.map((filePath) => {
            const bucket = entryBuckets.get(filePath);
            const existing = bucket && bucket.length > 0 ? bucket.shift() : null;
            if (existing) {
                return {
                    ...existing,
                    id: existing.id || filePath,
                    filePath,
                };
            }

            return {
                id: filePath,
                duration: -1,
                title: filePath.split("/").pop() || filePath,
                filePath,
                addedAt: now,
            };
        });
        const m3uContent = writeM3U({ songs: m3uTracks, suggestions: [] });

        const file = new File(decodeIfUriEncoded(playlist.filePath));
        file.write(m3uContent);

        const nextPlaylists = localMusicState$.playlists.peek().map((pl) =>
            pl.id === playlist.id
                ? {
                      ...pl,
                      trackPaths: [...trackPaths],
                      tracks: m3uTracks,
                      trackCount: trackPaths.length,
                  }
                : pl,
        );
        localMusicState$.playlists.set(nextPlaylists);
    } catch (error) {
        console.error("Failed to save local playlist tracks:", error);
    }
}

// Set current playlist selection
export function setCurrentPlaylist(playlistId: string, playlistType: "file"): void {
    localMusicState$.isLocalFilesSelected.set(playlistId === DEFAULT_LOCAL_PLAYLIST_ID);

    debugLocalMusicLog("setCurrentPlaylist", playlistId, playlistType);

    // Save current playlist to persistent state
    stateSaved$.assign({
        playlist: playlistId,
        playlistType,
    });
}

stateSaved$.playlist.onChange(({ value }) => {
    debugLocalMusicLog("stateSaved$.playlist.onChange", value);
});
stateSaved$.playlistType.onChange(({ value }) => {
    debugLocalMusicLog("stateSaved$.playlistType.onChange", value);
});

// Initialize and scan on app start
export function initializeLocalMusic(): void {
    batch(() => {
        const settings = librarySettings$.get();

        debugLocalMusicLog("initializeLocalMusic", settings);

        lastLibraryPaths = Array.isArray(settings.paths) ? [...settings.paths] : [];
        configureLibraryPathWatcher(lastLibraryPaths);

        if (!hasSubscribedToLibraryPathChanges) {
            hasSubscribedToLibraryPathChanges = true;
            librarySettings$.paths.onChange(({ value }) => {
                const userInitiated = pendingUserInitiatedLibraryChange;
                pendingUserInitiatedLibraryChange = false;

                const nextPaths = Array.isArray(value) ? [...value] : [];
                const removedPaths = lastLibraryPaths.filter((path) => !nextPaths.includes(path));
                if (removedPaths.length > 0) {
                    clearCachedLibraryData();
                }
                lastLibraryPaths = nextPaths;
                configureLibraryPathWatcher(nextPaths);

                if (userInitiated && !localMusicState$.isScanning.get()) {
                    debugLocalMusicLog("User initiated library change, scanning immediately");
                    scanLocalMusic().catch((error) => {
                        console.error("Failed to scan local music after user change:", error);
                    });
                    return;
                }

                scheduleScanAfterFileChange(userInitiated ? 0 : FILE_WATCH_DEBOUNCE_MS);
            });
        }

        // Restore isLocalFilesSelected state based on saved playlist type
        const savedPlaylistType = stateSaved$.playlistType.get();
        if (savedPlaylistType === "file") {
            const savedPlaylistId = stateSaved$.playlist.get();
            const isLocalFiles = savedPlaylistId === DEFAULT_LOCAL_PLAYLIST_ID;
            localMusicState$.isLocalFilesSelected.set(isLocalFiles);
            if (isLocalFiles) {
                debugLocalMusicLog("Restored default library playlist selection on startup");
            }
        }

        runAfterInteractionsWithLabel(() => {
            try {
                void loadLocalPlaylists();
            } catch (error) {
                console.error("Failed to load local playlists:", error);
            }
        }, "LocalMusic.loadLocalPlaylists");

        if (settings.autoScanOnStart) {
            scheduleInitialAutoScan();
        }
    });
}

function scheduleInitialAutoScan(): void {
    const queueCacheReady = loadQueueFromM3U().length > 0;
    const libraryCacheReady = hasCachedLibraryData();
    const deferInitialScan = queueCacheReady || libraryCacheReady;

    perfLog("LocalMusic.autoScan.policy", { deferInitialScan, queueCacheReady, libraryCacheReady });

    const scheduleScan = () => {
        debugLocalMusicLog("Auto-scanning local music during idle...");
        scanLocalMusic().catch((error) => {
            console.error("Failed to auto-scan local music:", error);
        });
    };

    if (deferInitialScan) {
        debugLocalMusicLog("Deferring auto-scan of local music until idle (cache available)");
        runAfterInteractions(scheduleScan);
        return;
    }

    debugLocalMusicLog("Auto-scanning local music on startup after interactions...");
    runAfterInteractionsWithLabel(scheduleScan, "LocalMusic.autoScanOnStart");
}
