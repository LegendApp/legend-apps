import { createJSONManager } from "@/utils/JSONManager";
import { deriveThumbnailKey } from "@/utils/thumbnails";

export interface PersistedLibraryTrack {
    root: number;
    rel: string;
    title: string;
    artist: string;
    album?: string;
    trackNumber?: number;
    duration: string;
    thumbnail?: string;
    thumb?: string;
}

export interface LibrarySnapshot {
    version: number;
    updatedAt: number;
    tracks: PersistedLibraryTrack[];
    lastScanTime: number | null;
    roots: string[];
}

const LIBRARY_CACHE_VERSION = 1;

const defaultSnapshot: LibrarySnapshot = {
    version: LIBRARY_CACHE_VERSION,
    updatedAt: 0,
    tracks: [],
    lastScanTime: null,
    roots: [],
};

const libraryCache$ = createJSONManager<LibrarySnapshot>({
    filename: "libraryCache",
    initialValue: defaultSnapshot,
    format: "json",
    saveTimeout: 0,
    preload: false,
});

type RawLibraryTrack = Partial<PersistedLibraryTrack>;

type RawLibrarySnapshot = Partial<LibrarySnapshot> & {
    artists?: unknown;
    albums?: unknown;
    playlists?: unknown;
    tracks?: RawLibraryTrack[] | PersistedLibraryTrack[];
    roots?: unknown;
};

const normalizeRootPath = (path: string): string => {
    if (!path) {
        return "";
    }

    const withoutPrefix = path.startsWith("file://") ? path.replace("file://", "") : path;
    const trimmed = withoutPrefix.replace(/\/+$/, "");
    return trimmed.length > 0 ? trimmed : withoutPrefix;
};

const fileNameFromPath = (path: string): string => {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash === -1 ? path : path.slice(lastSlash + 1);
};

const sanitizeTrack = (track: RawLibraryTrack, roots: string[]): PersistedLibraryTrack | null => {
    const rel = typeof track.rel === "string" && track.rel.length > 0 ? track.rel : "";
    if (!rel) {
        return null;
    }

    const root =
        typeof track.root === "number" && Number.isInteger(track.root) && track.root >= 0 && track.root < roots.length
            ? track.root
            : 0;

    const thumb =
        typeof track.thumb === "string" && track.thumb.length > 0 ? track.thumb : deriveThumbnailKey(track.thumbnail);

    const fileName = fileNameFromPath(rel);

    const trackNumber =
        typeof track.trackNumber === "number" && Number.isFinite(track.trackNumber) && track.trackNumber > 0
            ? Math.trunc(track.trackNumber)
            : undefined;

    return {
        root,
        rel,
        title: typeof track.title === "string" && track.title.length > 0 ? track.title : fileName,
        artist: typeof track.artist === "string" && track.artist.length > 0 ? track.artist : "Unknown Artist",
        album: typeof track.album === "string" && track.album.length > 0 ? track.album : undefined,
        trackNumber,
        duration: typeof track.duration === "string" && track.duration.length > 0 ? track.duration : "0:00",
        thumbnail:
            thumb === undefined && typeof track.thumbnail === "string" && track.thumbnail.length > 0
                ? track.thumbnail
            : undefined,
        thumb,
    };
};

const sanitizeSnapshot = (input: RawLibrarySnapshot): LibrarySnapshot => {
    const roots = Array.isArray(input.roots)
        ? input.roots
              .map((root) => (typeof root === "string" ? normalizeRootPath(root) : ""))
              .filter((root): root is string => root.length > 0)
        : [];

    const tracks = Array.isArray(input.tracks)
        ? input.tracks
              .map((track) => sanitizeTrack(track, roots))
              .filter((track): track is PersistedLibraryTrack => Boolean(track))
        : [];

    return {
        version: LIBRARY_CACHE_VERSION,
        updatedAt: typeof input.updatedAt === "number" ? input.updatedAt : Date.now(),
        tracks,
        lastScanTime: typeof input.lastScanTime === "number" ? input.lastScanTime : null,
        roots,
    };
};

export const getLibrarySnapshot = (): LibrarySnapshot => {
    try {
        const snapshot = libraryCache$.get();
        if (!snapshot) {
            return defaultSnapshot;
        }

        return sanitizeSnapshot(snapshot);
    } catch (error) {
        console.error("Failed to read library cache; resetting to defaults", error);
        libraryCache$.set(defaultSnapshot);
        return defaultSnapshot;
    }
};

export const persistLibrarySnapshot = (
    snapshot: Omit<LibrarySnapshot, "version" | "updatedAt"> & Partial<Pick<LibrarySnapshot, "updatedAt">>,
) => {
    const sanitized = sanitizeSnapshot({
        ...snapshot,
        updatedAt: snapshot.updatedAt ?? Date.now(),
    });

    libraryCache$.set(sanitized);
};

export const hasCachedLibraryData = (): boolean => getLibrarySnapshot().tracks.length > 0;

export const clearLibraryCache = (): void => {
    libraryCache$.set({
        ...defaultSnapshot,
        updatedAt: Date.now(),
    });
};
