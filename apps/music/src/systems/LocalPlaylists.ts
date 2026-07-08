import { Directory, File } from "expo-file-system/next";

import { libraryUI$, selectLibraryPlaylist, selectLibraryView } from "./LibraryState";
import {
    createLocalPlaylist,
    type LocalPlaylist,
    loadLocalPlaylists,
    localMusicState$,
    sanitizePlaylistFileName,
    saveLocalPlaylistTracks,
} from "./LocalMusicState";
import { ensureCacheDirectory, getCacheDirectory, getPlaylistsDirectory } from "../utils/cacheDirectories";
import { writeM3U } from "../utils/m3u";

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

const isEditablePlaylist = (playlist: LocalPlaylist): boolean =>
    playlist.source === "cache" && Boolean(playlist.filePath);

const getPlaylistOrThrow = (playlistId: string): LocalPlaylist => {
    const normalize = (value: string) => {
        try {
            return decodeURI(value);
        } catch {
            return value;
        }
    };
    const normalizedId = normalize(playlistId);
    const playlist = localMusicState$.playlists.peek().find((pl) => normalize(pl.id) === normalizedId) ?? null;
    if (!playlist) {
        throw new Error("Playlist not found");
    }
    return playlist;
};

const getUniquePlaylistFile = (
    directory: Directory,
    desiredName: string,
    currentFilePath?: string,
): { file: File; resolvedName: string } => {
    const trimmed = desiredName.trim();
    const baseName = trimmed.length > 0 ? trimmed : "New Playlist";
    const maxAttempts = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const resolvedName = attempt === 0 ? baseName : `${baseName} (${attempt + 1})`;
        const fileBase = sanitizePlaylistFileName(resolvedName);
        const fileName = `${fileBase}.m3u`;
        const candidate = new File(directory, fileName);
        const candidatePath = toFilePath(candidate.uri);

        if (!candidate.exists || (currentFilePath && candidatePath === currentFilePath)) {
            return { file: candidate, resolvedName };
        }
    }

    throw new Error(`Unable to create playlist: too many existing playlists named "${baseName}"`);
};

export async function addTracksToPlaylist(
    playlistId: string,
    trackPaths: string[],
    opts: { dedupe?: boolean } = {},
): Promise<{ addedPaths: string[]; playlist: LocalPlaylist }> {
    const playlist = getPlaylistOrThrow(playlistId);
    if (!isEditablePlaylist(playlist)) {
        throw new Error("Playlist is read-only");
    }

    const dedupe = opts.dedupe ?? true;
    const normalizedExisting = new Set(playlist.trackPaths.map((path) => toFilePath(path).toLowerCase()));
    const nextTrackPaths = [...playlist.trackPaths];
    const addedPaths: string[] = [];

    for (const rawPath of trackPaths) {
        const normalizedPath = toFilePath(rawPath);
        if (!normalizedPath) {
            continue;
        }

        const key = normalizedPath.toLowerCase();
        if (dedupe && normalizedExisting.has(key)) {
            continue;
        }

        normalizedExisting.add(key);
        nextTrackPaths.push(normalizedPath);
        addedPaths.push(normalizedPath);
    }

    if (addedPaths.length > 0) {
        await saveLocalPlaylistTracks(playlist, nextTrackPaths);
    }

    return { addedPaths, playlist: getPlaylistOrThrow(playlistId) };
}

export async function renamePlaylist(
    playlistId: string,
    nextName: string,
): Promise<{ playlistId: string; playlistName: string } | null> {
    const playlist = getPlaylistOrThrow(playlistId);
    if (!isEditablePlaylist(playlist)) {
        throw new Error("Playlist is read-only");
    }

    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === playlist.name) {
        return null;
    }

    const currentFile = new File(decodeIfUriEncoded(playlist.filePath));
    if (!currentFile.exists) {
        throw new Error("Playlist file not found");
    }

    const directory = currentFile.parentDirectory ?? getPlaylistsDirectory();
    ensureCacheDirectory(directory);

    const { file: nextFile, resolvedName } = getUniquePlaylistFile(directory, trimmedName, playlist.filePath);
    const nextFilePath = toFilePath(nextFile.uri);

    if (nextFilePath === playlist.filePath) {
        return null;
    }

    const content = await currentFile.text();
    nextFile.write(content);
    currentFile.delete();

    await loadLocalPlaylists();

    if (
        libraryUI$.selectedView.peek() === "playlist" &&
        libraryUI$.selectedPlaylistId.peek() &&
        libraryUI$.selectedPlaylistId.peek() === playlistId
    ) {
        selectLibraryPlaylist(nextFilePath);
    }

    return { playlistId: nextFilePath, playlistName: resolvedName };
}

export async function deletePlaylist(playlistId: string): Promise<void> {
    const playlist = getPlaylistOrThrow(playlistId);
    if (!isEditablePlaylist(playlist)) {
        throw new Error("Playlist is read-only");
    }

    const file = new File(decodeIfUriEncoded(playlist.filePath));
    if (file.exists) {
        file.delete();
    }

    if (libraryUI$.selectedView.peek() === "playlist" && libraryUI$.selectedPlaylistId.peek() === playlistId) {
        selectLibraryView("songs");
    }

    await loadLocalPlaylists();
}

export async function exportPlaylistToFile(playlistId: string): Promise<string | null> {
    const playlist = getPlaylistOrThrow(playlistId);

    const directory = new Directory(getPlaylistsDirectory());
    ensureCacheDirectory(directory);

    const fileBase = sanitizePlaylistFileName(playlist.name);
    const file = new File(directory, `${fileBase}.m3u`);

    const m3uTracks = playlist.trackPaths.map((filePath) => ({
        id: filePath,
        duration: -1,
        title: filePath.split("/").pop() || filePath,
        filePath,
    }));
    const m3uContent = writeM3U({ songs: m3uTracks, suggestions: [] });

    file.write(m3uContent);
    return toFilePath(file.uri);
}

export async function duplicatePlaylistToCache(playlistId: string, nextName?: string): Promise<LocalPlaylist> {
    const playlist = getPlaylistOrThrow(playlistId);
    const name = nextName?.trim() || playlist.name;

    const nextPlaylist = await createLocalPlaylist(name);
    await saveLocalPlaylistTracks(nextPlaylist, playlist.trackPaths);
    await loadLocalPlaylists();

    return getPlaylistOrThrow(nextPlaylist.id);
}
