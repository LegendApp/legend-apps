import { useValue } from "@legendapp/state/react";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";

import { localAudioControls } from "@/components/LocalAudioPlayer";
import { showToast } from "@/components/Toast";
import { useOnHotkeys } from "@/systems/keyboard/Keyboard";
import type { LibraryItem, LibraryTrack } from "@/systems/LibraryState";
import type { LocalPlaylist, LocalTrack } from "@/systems/LocalMusicState";
import {
    createLocalPlaylist,
    DEFAULT_LOCAL_PLAYLIST_ID,
    DEFAULT_LOCAL_PLAYLIST_NAME,
    loadLocalPlaylists,
    localMusicState$,
    saveLocalPlaylistTracks,
    setCurrentPlaylist,
} from "@/systems/LocalMusicState";
import { stateSaved$ } from "@/systems/State";

import { perfLog } from "@/utils/perfLogger";
import type { QueueAction } from "@/utils/queueActions";
import { buildTrackLookup, getTracksForLibraryItem, resolvePlaylistTracks } from "@/utils/trackResolution";

interface PlaylistOption {
    id: string;
    name: string;
    count: number;
    type: "local-files" | "saved";
    trackPaths?: string[];
}

interface UsePlaylistOptionsResult {
    availablePlaylistIds: string[];
    playlistMap: Map<string, PlaylistOption>;
    tracksByPath: Map<string, LocalTrack>;
}

interface PlaylistOptionsSource {
    tracks: LocalTrack[];
    playlists: LocalPlaylist[];
}

export function usePlaylistOptions(localMusicState: PlaylistOptionsSource): UsePlaylistOptionsResult {
    const localFilesPlaylist = useMemo<PlaylistOption>(
        () => ({
            id: DEFAULT_LOCAL_PLAYLIST_ID,
            name: DEFAULT_LOCAL_PLAYLIST_NAME,
            count: localMusicState.tracks.length,
            type: "local-files",
        }),
        [localMusicState.tracks.length],
    );

    const savedPlaylistOptions = useMemo<PlaylistOption[]>(
        () =>
            localMusicState.playlists.map((playlist) => ({
                id: playlist.id,
                name: playlist.id === DEFAULT_LOCAL_PLAYLIST_ID ? DEFAULT_LOCAL_PLAYLIST_NAME : playlist.name,
                count: playlist.trackCount,
                type: "saved" as const,
                trackPaths: playlist.trackPaths,
            })),
        [localMusicState.playlists],
    );

    const availablePlaylists = useMemo(
        () => [localFilesPlaylist, ...savedPlaylistOptions],
        [localFilesPlaylist, savedPlaylistOptions],
    );

    const availablePlaylistIds = useMemo(() => availablePlaylists.map((playlist) => playlist.id), [availablePlaylists]);

    const playlistMap = useMemo(
        () => new Map(availablePlaylists.map((playlist) => [playlist.id, playlist])),
        [availablePlaylists],
    );

    const tracksByPath = useMemo(() => buildTrackLookup(localMusicState.tracks), [localMusicState.tracks]);

    return {
        availablePlaylistIds,
        playlistMap,
        tracksByPath,
    };
}

interface PlaylistQueueHandlersInput {
    playlistMap: Map<string, PlaylistOption>;
    tracksByPath: Map<string, LocalTrack>;
    localTracks: LocalTrack[];
    libraryTracks: LibraryTrack[];
}

interface PlaylistQueueHandlersResult {
    handlePlaylistSelect: (playlistId: string) => void;
    handleTrackSelect: (track: LocalTrack, action: QueueAction) => void;
    handleLibraryItemSelect: (item: LibraryItem, action: QueueAction) => void;
    handleSearchPlaylistSelect: (playlist: LocalPlaylist) => void;
}

export function usePlaylistQueueHandlers({
    playlistMap,
    tracksByPath,
    localTracks,
    libraryTracks,
}: PlaylistQueueHandlersInput): PlaylistQueueHandlersResult {
    const handlePlaylistSelect = useCallback(
        (playlistId: string) => {
            const playlist = playlistMap.get(playlistId);

            if (!playlist) {
                console.warn("Playlist not found:", playlistId);
                return;
            }

            perfLog("PlaylistSelector.handlePlaylistSelect", { playlistId });

            const { tracks: resolvedTracks, missingPaths } = resolvePlaylistTracks(
                {
                    id: playlist.id,
                    name: playlist.name,
                    type: playlist.type,
                    trackPaths: playlist.trackPaths,
                },
                localTracks,
                tracksByPath,
            );

            if (resolvedTracks.length > 0) {
                localAudioControls.queue.replace(resolvedTracks, { startIndex: 0, playImmediately: true });
            } else if (playlist.type !== "local-files") {
                console.warn(`No tracks resolved for playlist ${playlist.name}`);
                localAudioControls.queue.clear();
            }

            if (missingPaths.length > 0) {
                console.warn(`Playlist ${playlist.name} is missing ${missingPaths.length} tracks from the library`);
            }

            setCurrentPlaylist(playlistId, "file");
        },
        [localTracks, playlistMap, tracksByPath],
    );

    const handleTrackSelect = useCallback((track: LocalTrack, action: QueueAction) => {
        perfLog("PlaylistSelector.handleTrackSelect", { trackId: track.id, action });

        switch (action) {
            case "play-now":
                localAudioControls.queue.insertNext(track, { playImmediately: true });
                break;
            case "play-next":
                localAudioControls.queue.insertNext(track);
                break;
            default:
                localAudioControls.queue.append(track);
                break;
        }
    }, []);

    const handleLibraryItemSelect = useCallback(
        (item: LibraryItem, action: QueueAction) => {
            perfLog("PlaylistSelector.handleLibraryItemSelect", { itemId: item.id, type: item.type, action });

            const tracksToAdd = getTracksForLibraryItem(libraryTracks, item);
            if (tracksToAdd.length === 0) {
                return;
            }

            switch (action) {
                case "play-now":
                    localAudioControls.queue.insertNext(tracksToAdd, { playImmediately: true });
                    break;
                case "play-next":
                    localAudioControls.queue.insertNext(tracksToAdd);
                    break;
                default:
                    localAudioControls.queue.append(tracksToAdd);
                    break;
            }
        },
        [libraryTracks],
    );

    const handleSearchPlaylistSelect = useCallback(
        (playlist: LocalPlaylist) => {
            perfLog("PlaylistSelector.handleSearchPlaylistSelect", { playlistId: playlist.id });

            const { tracks: resolvedTracks, missingPaths } = resolvePlaylistTracks(
                {
                    id: playlist.id,
                    name: playlist.name,
                    trackPaths: playlist.trackPaths,
                },
                localTracks,
                tracksByPath,
            );

            if (resolvedTracks.length > 0) {
                localAudioControls.queue.replace(resolvedTracks, { startIndex: 0, playImmediately: true });
            } else if (playlist.id !== DEFAULT_LOCAL_PLAYLIST_ID) {
                console.warn(`No tracks resolved for playlist ${playlist.name}`);
                localAudioControls.queue.clear();
            }

            if (missingPaths.length > 0) {
                console.warn(`Playlist ${playlist.name} is missing ${missingPaths.length} tracks from the library`);
            }

            setCurrentPlaylist(playlist.id, "file");
        },
        [localTracks, tracksByPath],
    );

    return {
        handlePlaylistSelect,
        handleTrackSelect,
        handleLibraryItemSelect,
        handleSearchPlaylistSelect,
    };
}

export function useLibraryToggle() {
    const isLibraryOpen = useValue(stateSaved$.libraryIsOpen);

    const toggleLibraryWindow = useCallback(() => {
        perfLog("PlaylistSelector.toggleLibraryWindow", { isOpen: stateSaved$.libraryIsOpen.get() });
        stateSaved$.libraryIsOpen.set(!stateSaved$.libraryIsOpen.get());
    }, []);

    return { isLibraryOpen, toggleLibraryWindow };
}

interface QueueExporterArgs {
    queueTracks: LocalTrack[];
}

export function useQueueExporter({ queueTracks }: QueueExporterArgs) {
    const confirmOverwrite = useCallback(async (playlistName: string): Promise<boolean> => {
        return await new Promise((resolve) => {
            Alert.alert(
                "Overwrite playlist?",
                `A playlist named “${playlistName}” already exists. Overwrite it?`,
                [
                    { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
                    { text: "Overwrite", style: "destructive", onPress: () => resolve(true) },
                ],
                { cancelable: true, onDismiss: () => resolve(false) },
            );
        });
    }, []);

    const handleSavePlaylist = useCallback(
        async (playlistName: string): Promise<boolean> => {
            perfLog("PlaylistSelector.handleSavePlaylist", { playlistName });

            const trimmedName = playlistName.trim();
            if (!trimmedName) {
                return false;
            }

            if (queueTracks.length === 0) {
                showToast("No tracks to save", "error");
                return false;
            }

            const normalizedName = trimmedName.toLowerCase();
            const playlists = localMusicState$.playlists.peek();
            const existing =
                playlists.find((playlist) => playlist.name.trim().toLowerCase() === normalizedName) ?? null;
            const trackPaths = queueTracks.map((track) => track.filePath);

            try {
                if (existing) {
                    let isEditable = false;
                    if (existing.source === "cache") {
                        if (Boolean(existing.filePath)) {
                            isEditable = true;
                        }
                    }
                    let isReadOnly = !isEditable;
                    if (existing.id === DEFAULT_LOCAL_PLAYLIST_ID) {
                        isReadOnly = true;
                    }
                    if (isReadOnly) {
                        showToast("That playlist is read-only", "error");
                        return false;
                    }

                    const confirmed = await confirmOverwrite(existing.name);
                    if (!confirmed) {
                        return false;
                    }

                    await saveLocalPlaylistTracks(existing, trackPaths);
                    loadLocalPlaylists();
                    showToast(`${existing.name} was saved`, "info");
                    return true;
                }

                const playlist = await createLocalPlaylist(trimmedName);
                await saveLocalPlaylistTracks(playlist, trackPaths);
                loadLocalPlaylists();
                showToast(`${playlist.name} was saved`, "info");
                return true;
            } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to save playlist";
                showToast(message, "error");
                return false;
            }
        },
        [confirmOverwrite, queueTracks],
    );

    return { handleSavePlaylist };
}

export function generateM3UPlaylist(
    tracks: { title: string; artist: string; filePath: string; duration?: string }[],
): string {
    const lines = ["#EXTM3U", ""];

    for (const track of tracks) {
        let durationSeconds = -1;
        if (track.duration) {
            const parts = track.duration.split(":");
            if (parts.length === 2) {
                const minutes = Number.parseInt(parts[0], 10) || 0;
                const seconds = Number.parseInt(parts[1], 10) || 0;
                durationSeconds = minutes * 60 + seconds;
            } else {
                const numeric = Number.parseInt(track.duration, 10);
                if (!Number.isNaN(numeric) && numeric >= 0) {
                    durationSeconds = numeric;
                }
            }
        }

        lines.push(`#EXTINF:${durationSeconds},${track.artist} - ${track.title}`);
        lines.push(track.filePath);
        lines.push("");
    }

    return lines.join("\n");
}

export const selectedPlaylist$ = stateSaved$.playlist;

export type { PlaylistOption };
