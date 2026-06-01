import { observable } from "@legendapp/state";
import type { LibrarySnapshot, PersistedLibraryTrack } from "@/systems/LibraryCache";
import { getLibrarySnapshot, persistLibrarySnapshot } from "@/systems/LibraryCache";
import { type LocalTrack, librarySettings$, localMusicState$ } from "@/systems/LocalMusicState";
import { perfCount, perfLog, perfTime } from "@/utils/perfLogger";
import { runAfterInteractions } from "@/utils/runAfterInteractions";
import { resolveThumbnailFromFields } from "@/utils/thumbnails";

export interface LibraryItem {
    id: string;
    type: "artist" | "album" | "playlist" | "track" | "all";
    name: string;
    children?: LibraryItem[];
    trackCount?: number;
    duration?: number;
    album?: string;
    artist?: string;
}

export interface LibraryTrack extends LocalTrack {}

export type LibraryView = "songs" | "artists" | "albums" | "starred" | "playlist";
export type PlaylistSortMode = "playlist-order" | "date-added" | "title" | "artist" | "album";
export type PlaylistSortDirection = "asc" | "desc";

export interface LibraryUIState {
    selectedView: LibraryView;
    selectedPlaylistId: string | null;
    searchQuery: string;
    playlistSort: PlaylistSortMode;
    playlistSortDirection: PlaylistSortDirection;
}

// Library UI state (persistent)
export const libraryUI$ = observable<LibraryUIState>({
    selectedView: "artists",
    selectedPlaylistId: null,
    searchQuery: "",
    playlistSort: "playlist-order",
    playlistSortDirection: "asc",
});

export function selectLibraryView(view: LibraryView): void {
    libraryUI$.selectedView.set(view);

    if (view !== "playlist") {
        libraryUI$.selectedPlaylistId.set(null);
    }
}

export function selectLibraryPlaylist(playlistId: string | null): void {
    libraryUI$.selectedView.set("playlist");
    libraryUI$.selectedPlaylistId.set(playlistId);
}

// Library data derived from local music state
export const library$ = observable({
    artists: [] as LibraryItem[],
    albums: [] as LibraryItem[],
    playlists: [] as LibraryItem[],
    tracks: [] as LibraryTrack[],
    lastScanTime: null as Date | null,
});

type LibrarySnapshotPayload = Omit<LibrarySnapshot, "version" | "updatedAt">;

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

const resolveRelativePathForTrack = (
    track: LocalTrack,
    roots: string[],
): { rootIndex: number; relativePath: string } => {
    const normalizedFilePath = normalizeRootPath(track.filePath);

    for (let i = 0; i < roots.length; i++) {
        const root = roots[i];
        if (root && normalizedFilePath.startsWith(root)) {
            const relativePath = normalizedFilePath.slice(root.length).replace(/^\/+/, "");
            return {
                rootIndex: i,
                relativePath: relativePath.length > 0 ? relativePath : fileNameFromPath(normalizedFilePath),
            };
        }
    }

    return {
        rootIndex: roots.length > 0 ? 0 : 0,
        relativePath: normalizedFilePath,
    };
};

const buildPersistedTrack = (track: LocalTrack, roots: string[]): PersistedLibraryTrack => {
    const { rootIndex, relativePath } = resolveRelativePathForTrack(track, roots);
    const trackNumber =
        typeof track.trackNumber === "number" && Number.isFinite(track.trackNumber) && track.trackNumber > 0
            ? Math.trunc(track.trackNumber)
            : undefined;

    return {
        root: rootIndex,
        rel: relativePath,
        title: track.title,
        artist: track.artist,
        album: track.album,
        trackNumber,
        duration: track.duration,
    };
};

const buildFilePathFromPersisted = (track: PersistedLibraryTrack, roots: string[]): string => {
    const root = roots[track.root];
    if (root) {
        if (track.rel.startsWith("/")) {
            return `${root}${track.rel}`;
        }

        if (root.endsWith("/")) {
            return `${root}${track.rel}`;
        }

        return `${root}/${track.rel}`;
    }

    return track.rel;
};

const collectLibrarySnapshot = (sourceTracks: LibraryTrack[]): LibrarySnapshotPayload => {
    const lastScan = library$.lastScanTime.peek();
    const roots = librarySettings$.paths
        .get()
        .map((path) => normalizeRootPath(path))
        .filter(Boolean);
    const tracks = sourceTracks.map((track) => buildPersistedTrack(track, roots));

    return {
        tracks,
        roots,
        lastScanTime: lastScan instanceof Date ? lastScan.getTime() : null,
    };
};

type LibrarySnapshotSignature = {
    tracksRef: PersistedLibraryTrack[];
    tracksLength: number;
    lastScanTime: number | null;
    rootsHash: string;
    sourceTracksRef: LibraryTrack[];
};

const makeLibrarySnapshotSignature = (
    snapshot: LibrarySnapshotPayload,
    sourceTracksRef: LibraryTrack[],
): LibrarySnapshotSignature => ({
    tracksRef: snapshot.tracks,
    tracksLength: snapshot.tracks.length,
    lastScanTime: snapshot.lastScanTime,
    rootsHash: snapshot.roots.join("|"),
    sourceTracksRef,
});

let lastLibrarySnapshotSignature: LibrarySnapshotSignature | null = null;
// Cache artist display names and keys to avoid repeated allocations
const artistDisplayCache = new Map<string, string>();
const artistKeyCache = new Map<string, string>();

const scheduleLibrarySnapshotPersist = () => {
    runAfterInteractions(() => {
        const sourceTracks = library$.tracks.peek();
        const snapshot = collectLibrarySnapshot(sourceTracks);
        const signature = makeLibrarySnapshotSignature(snapshot, sourceTracks);
        if (
            lastLibrarySnapshotSignature &&
            lastLibrarySnapshotSignature.sourceTracksRef === signature.sourceTracksRef &&
            lastLibrarySnapshotSignature.tracksLength === signature.tracksLength &&
            lastLibrarySnapshotSignature.lastScanTime === signature.lastScanTime &&
            lastLibrarySnapshotSignature.rootsHash === signature.rootsHash
        ) {
            return;
        }

        persistLibrarySnapshot(snapshot);
        lastLibrarySnapshotSignature = signature;
    });
};

function normalizeTracks(localTracks: LocalTrack[]): LibraryTrack[] {
    perfCount("LibraryState.normalizeTracks");
    return perfTime("LibraryState.normalizeTracks", () => localTracks);
}

function buildArtistItems(tracks: LibraryTrack[]): LibraryItem[] {
    perfCount("LibraryState.buildArtistItems");
    const artistMap = new Map<string, { name: string; count: number }>();

    for (const track of tracks) {
        const name = normalizeArtistName(track.artist);
        const key = getArtistKey(track.artist);
        const entry = artistMap.get(key);
        if (entry) {
            entry.count += 1;
            if (entry.name === "Unknown Artist" && name !== "Unknown Artist") {
                entry.name = name;
            }
        } else {
            artistMap.set(key, { name, count: 1 });
        }
    }

    return Array.from(artistMap.entries())
        .map(([key, { name, count }]) => ({
            id: `artist-${key}`,
            type: "artist" as const,
            name,
            trackCount: count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function buildAlbumItems(tracks: LibraryTrack[]): LibraryItem[] {
    perfCount("LibraryState.buildAlbumItems");

    const albumMap = new Map<
        string,
        {
            album: string;
            artist: string | undefined;
            count: number;
        }
    >();

    for (const track of tracks) {
        const albumName = track.album?.trim() || "Unknown Album";
        const key = albumName.toLowerCase();
        const entry = albumMap.get(key);

        if (entry) {
            entry.count += 1;
        } else {
            albumMap.set(key, {
                album: albumName,
                artist: track.artist,
                count: 1,
            });
        }
    }

    return Array.from(albumMap.values())
        .map(({ album, artist, count }) => ({
            id: `album-${slugify(`${album}-${artist ?? "various"}`)}`,
            type: "album" as const,
            name: album,
            album,
            artist,
            trackCount: count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return slug || "unknown";
}

export function normalizeArtistName(name: string): string {
    const cached = artistDisplayCache.get(name);
    if (cached) {
        return cached;
    }

    const trimmedName = name?.trim() || "";
    const displayName = trimmedName.length > 0 ? trimmedName : "Unknown Artist";
    artistDisplayCache.set(name, displayName);
    return displayName;
}

export function getArtistKey(name: string, existingKey?: string): string {
    if (existingKey) {
        return existingKey;
    }

    const cached = artistKeyCache.get(name);
    if (cached) {
        return cached;
    }

    const displayName = normalizeArtistName(name);
    const key = slugify(displayName);
    artistKeyCache.set(name, key);
    return key;
}

function syncLibraryFromLocalState(): void {
    perfLog("LibraryState.sync.start");
    artistDisplayCache.clear();
    artistKeyCache.clear();
    const localTracks = localMusicState$.tracks.get();
    const normalizedTracks = normalizeTracks(localTracks);

    library$.tracks.set(normalizedTracks);
    library$.artists.set(buildArtistItems(normalizedTracks));
    library$.albums.set(buildAlbumItems(normalizedTracks));
    perfLog("LibraryState.sync.end", { trackCount: normalizedTracks.length });
    scheduleLibrarySnapshotPersist();
}

syncLibraryFromLocalState();
const initialLastScan = librarySettings$.lastScanTime.get();
library$.lastScanTime.set(initialLastScan ? new Date(initialLastScan) : null);
const initialTracks = library$.tracks.peek();
lastLibrarySnapshotSignature = makeLibrarySnapshotSignature(collectLibrarySnapshot(initialTracks), initialTracks);

localMusicState$.tracks.onChange(syncLibraryFromLocalState);
localMusicState$.isScanning.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

librarySettings$.lastScanTime.onChange(({ value }) => {
    library$.lastScanTime.set(value ? new Date(value) : null);
    scheduleLibrarySnapshotPersist();
});

library$.artists.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

library$.albums.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

library$.playlists.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

library$.tracks.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

library$.lastScanTime.onChange(() => {
    scheduleLibrarySnapshotPersist();
});

export let libraryHydratedFromCache = false;

export const hydrateLibraryFromCache = (): boolean => {
    const snapshot = getLibrarySnapshot();
    const hasData = snapshot.tracks.length > 0;

    if (!hasData) {
        return false;
    }

    artistDisplayCache.clear();
    artistKeyCache.clear();
    const roots = Array.isArray(snapshot.roots) ? snapshot.roots.map((root) => normalizeRootPath(root)) : [];

    const tracks = snapshot.tracks.map((track) => {
        const filePath = buildFilePathFromPersisted(track, roots);
        const resolvedThumbnail = resolveThumbnailFromFields({
            thumbnail: track.thumbnail,
            thumbnailKey: track.thumb,
        });
        const artistName = normalizeArtistName(track.artist);

        return {
            id: filePath,
            title: track.title,
            artist: artistName,
            album: track.album,
            trackNumber: track.trackNumber,
            duration: track.duration,
            filePath,
            fileName: fileNameFromPath(filePath),
            thumbnail: resolvedThumbnail.thumbnail,
        };
    });

    library$.tracks.set(tracks);
    library$.artists.set(buildArtistItems(tracks));
    library$.albums.set(buildAlbumItems(tracks));
    library$.lastScanTime.set(snapshot.lastScanTime ? new Date(snapshot.lastScanTime) : null);

    lastLibrarySnapshotSignature = makeLibrarySnapshotSignature(
        {
            tracks: snapshot.tracks,
            roots,
            lastScanTime: snapshot.lastScanTime,
        },
        tracks,
    );

    libraryHydratedFromCache = true;
    return true;
};
