import type { Observable } from "@legendapp/state";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";

import type { MediaLibraryDragData } from "@/components/dnd";
import { localAudioControls } from "@/components/LocalAudioPlayer";
import { showToast } from "@/components/Toast";
import type { TrackData } from "@/components/TrackItem";
import { usePlaylistSelection } from "@/hooks/usePlaylistSelection";
import { type ContextMenuItem, showContextMenu } from "@legend-desktop/context-menu";
import {
    getArtistKey,
    type LibraryTrack,
    type LibraryView,
    library$,
    libraryUI$,
    normalizeArtistName,
    type PlaylistSortDirection,
    type PlaylistSortMode,
} from "@/systems/LibraryState";
import { type LocalPlaylist, localMusicState$, saveLocalPlaylistTracks } from "@/systems/LocalMusicState";
import { addTracksToPlaylist } from "@/systems/LocalPlaylists";
import { getQueueAction, type QueueAction } from "@/utils/queueActions";
import { buildTrackContextMenuItems, handleTrackContextMenuSelection } from "@/utils/trackContextMenu";
import { buildTrackLookup } from "@/utils/trackResolution";

type TrackListItem = TrackData;
type LibraryTrackListItem = TrackData & { sourceTrack?: LibraryTrack };

const ADD_TO_PLAYLIST_MENU_ITEM: ContextMenuItem = { id: "add-to-playlist", title: "Add to Playlist…" };

const getSortableTrackNumber = (track: LibraryTrack): number | null => {
    const trackNumber = track.trackNumber;
    if (typeof trackNumber !== "number" || !Number.isFinite(trackNumber)) {
        return null;
    }
    return trackNumber;
};

const getAlbumSortInfo = (track: LibraryTrack): { key: string; displayName: string; isMissing: boolean } => {
    const trimmed = track.album?.trim() ?? "";
    if (!trimmed) {
        return { key: "__missing__", displayName: "Unknown Album", isMissing: true };
    }

    return { key: trimmed.toLowerCase(), displayName: trimmed, isMissing: false };
};

const compareTextValues = (valueA?: string, valueB?: string): number => {
    return (valueA ?? "").localeCompare(valueB ?? "");
};

const applySortDirection = (value: number, direction: PlaylistSortDirection): number => {
    if (direction === "desc") {
        return value * -1;
    }
    return value;
};

const sortTracksByField = (
    tracks: LibraryTrack[],
    field: "title" | "artist" | "album",
    direction: PlaylistSortDirection,
): LibraryTrack[] => {
    const indexedTracks = tracks.map((track, index) => ({ track, index }));
    indexedTracks.sort((a, b) => {
        const valueA =
            field === "artist" ? a.track.artist : field === "album" ? (a.track.album ?? "") : a.track.title;
        const valueB =
            field === "artist" ? b.track.artist : field === "album" ? (b.track.album ?? "") : b.track.title;
        const compare = applySortDirection(compareTextValues(valueA, valueB), direction);
        if (compare !== 0) {
            return compare;
        }
        const titleCompare = applySortDirection(compareTextValues(a.track.title, b.track.title), direction);
        if (titleCompare !== 0) {
            return titleCompare;
        }
        return a.index - b.index;
    });
    return indexedTracks.map(({ track }) => track);
};

const sortTracksByDateAdded = (tracks: LibraryTrack[], direction: PlaylistSortDirection): LibraryTrack[] => {
    const indexedTracks = tracks.map((track, index) => ({ track, index }));
    indexedTracks.sort((a, b) => {
        const addedA = typeof a.track.addedAt === "number" ? a.track.addedAt : null;
        const addedB = typeof b.track.addedAt === "number" ? b.track.addedAt : null;
        if (addedA != null && addedB != null && addedA !== addedB) {
            return applySortDirection(addedA - addedB, direction);
        }
        if (addedA != null && addedB == null) {
            return -1;
        }
        if (addedA == null && addedB != null) {
            return 1;
        }
        return a.index - b.index;
    });
    return indexedTracks.map(({ track }) => track);
};

const sortTracksByMode = (
    tracks: LibraryTrack[],
    mode: PlaylistSortMode,
    direction: PlaylistSortDirection,
): LibraryTrack[] => {
    if (mode === "playlist-order") {
        if (direction === "desc") {
            return [...tracks].reverse();
        }
        return tracks;
    }
    if (mode === "date-added") {
        return sortTracksByDateAdded(tracks, direction);
    }
    if (mode === "title" || mode === "artist" || mode === "album") {
        return sortTracksByField(tracks, mode, direction);
    }
    return tracks;
};

const sortTracksByAlbumThenTrackNumber = (
    tracks: LibraryTrack[],
    direction: PlaylistSortDirection,
): LibraryTrack[] =>
    [...tracks].sort((a, b) => {
        const albumInfoA = getAlbumSortInfo(a);
        const albumInfoB = getAlbumSortInfo(b);
        if (albumInfoA.isMissing !== albumInfoB.isMissing) {
            return albumInfoA.isMissing ? 1 : -1;
        }
        if (albumInfoA.key !== albumInfoB.key) {
            return applySortDirection(albumInfoA.key.localeCompare(albumInfoB.key), direction);
        }

        const trackNumberA = getSortableTrackNumber(a);
        const trackNumberB = getSortableTrackNumber(b);
        if (trackNumberA != null && trackNumberB != null && trackNumberA !== trackNumberB) {
            return applySortDirection(trackNumberA - trackNumberB, direction);
        }

        return applySortDirection(compareTextValues(a.title, b.title), direction);
    });

const sortTracksByTrackNumber = (tracks: LibraryTrack[], direction: PlaylistSortDirection): LibraryTrack[] =>
    [...tracks].sort((a, b) => {
        const trackNumberA = getSortableTrackNumber(a);
        const trackNumberB = getSortableTrackNumber(b);
        if (trackNumberA != null && trackNumberB != null && trackNumberA !== trackNumberB) {
            return applySortDirection(trackNumberA - trackNumberB, direction);
        }
        return applySortDirection(compareTextValues(a.title, b.title), direction);
    });

const sortArtistGroupTracks = (
    tracks: LibraryTrack[],
    mode: PlaylistSortMode,
    direction: PlaylistSortDirection,
): LibraryTrack[] => {
    if (mode === "title") {
        return sortTracksByField(tracks, "title", direction);
    }
    if (mode === "date-added") {
        return sortTracksByDateAdded(tracks, direction);
    }
    if (mode === "album" || mode === "artist" || mode === "playlist-order") {
        return sortTracksByAlbumThenTrackNumber(tracks, direction);
    }
    return sortTracksByAlbumThenTrackNumber(tracks, direction);
};

const sortAlbumGroupTracks = (
    tracks: LibraryTrack[],
    mode: PlaylistSortMode,
    direction: PlaylistSortDirection,
): LibraryTrack[] => {
    if (mode === "title") {
        return sortTracksByField(tracks, "title", direction);
    }
    if (mode === "artist") {
        return sortTracksByField(tracks, "artist", direction);
    }
    if (mode === "date-added") {
        return sortTracksByDateAdded(tracks, direction);
    }
    return sortTracksByTrackNumber(tracks, direction);
};

interface UseLibraryTrackListResult {
    tracks: TrackData[];
    selectedIndices$: Observable<Set<number>>;
    handleTrackClick: (index: number, event?: NativeMouseEvent) => void;
    handleTrackDoubleClick: (index: number, event?: NativeMouseEvent) => void;
    handleTrackContextMenu: (index: number, event: NativeMouseEvent) => Promise<void>;
    handleTrackQueueAction: (index: number, action: QueueAction) => void;
    syncSelectionAfterReorder: (fromIndex: number, toIndex: number) => void;
    handleNativeDragStart: () => void;
    buildDragData: (activeIndex: number) => MediaLibraryDragData;
    keyExtractor: (item: TrackData) => string;
}

interface BuildTrackItemsInput {
    tracks: LibraryTrack[];
    playlists: LocalPlaylist[];
    selectedView: LibraryView;
    selectedPlaylistId: string | null;
    searchQuery: string;
    playlistSort: PlaylistSortMode;
    playlistSortDirection: PlaylistSortDirection;
}

export function buildTrackItems({
    tracks,
    playlists,
    selectedView,
    selectedPlaylistId,
    searchQuery,
    playlistSort,
    playlistSortDirection,
}: BuildTrackItemsInput) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const matchesQuery = (track: LibraryTrack): boolean => {
        if (!normalizedQuery) {
            return true;
        }

        const title = track.title?.toLowerCase() ?? "";
        const artist = track.artist?.toLowerCase() ?? "";
        const album = track.album?.toLowerCase() ?? "";
        return title.includes(normalizedQuery) || artist.includes(normalizedQuery) || album.includes(normalizedQuery);
    };

    const toTrackItem = (track: LibraryTrack, viewIndex: number, idOverride?: string): LibraryTrackListItem => ({
        id: idOverride ?? track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: formatDuration(track.duration),
        thumbnail: track.thumbnail,
        isMissing: track.isMissing,
        addedAt: track.addedAt,
        index: viewIndex,
        trackIndex: track.trackNumber,
        sourceTrack: track,
    });

    if (selectedView === "starred") {
        return {
            trackItems: [] as LibraryTrackListItem[],
        };
    }

    const filteredTracks = normalizedQuery ? tracks.filter(matchesQuery) : tracks;

    if (selectedView === "artists") {
        const artistGroups = new Map<string, { displayName: string; tracks: LibraryTrack[] }>();

        for (const track of filteredTracks) {
            const artistKey = getArtistKey(track.artist);
            const displayName = normalizeArtistName(track.artist);
            const existing = artistGroups.get(artistKey);
            if (existing) {
                if (existing.displayName === "Unknown Artist" && displayName !== "Unknown Artist") {
                    existing.displayName = displayName;
                }
                existing.tracks.push(track);
            } else {
                artistGroups.set(artistKey, { displayName, tracks: [track] });
            }
        }

        const sortedGroups = Array.from(artistGroups.entries()).sort((a, b) =>
            applySortDirection(a[0].localeCompare(b[0]), playlistSortDirection),
        );
        const trackItems: LibraryTrackListItem[] = [];
        let viewIndex = 0;

        for (const [artistKey, group] of sortedGroups) {
            trackItems.push({
                id: `sep-artist-${artistKey}`,
                title: `— ${group.displayName} —`,
                artist: "",
                album: "",
                duration: "",
                isSeparator: true,
            });

            const groupTracks = sortArtistGroupTracks(group.tracks, playlistSort, playlistSortDirection);
            for (const track of groupTracks) {
                trackItems.push(toTrackItem(track, viewIndex));
                viewIndex += 1;
            }
        }

        return { trackItems };
    }

    if (selectedView === "albums") {
        const albumGroups = new Map<
            string,
            { info: { key: string; displayName: string; isMissing: boolean }; tracks: LibraryTrack[] }
        >();

        for (const track of filteredTracks) {
            const albumInfo = getAlbumSortInfo(track);
            const existing = albumGroups.get(albumInfo.key);
            if (existing) {
                existing.tracks.push(track);
            } else {
                albumGroups.set(albumInfo.key, { info: albumInfo, tracks: [track] });
            }
        }

        const sortedGroups = Array.from(albumGroups.values()).sort((a, b) => {
            if (a.info.isMissing !== b.info.isMissing) {
                return a.info.isMissing ? 1 : -1;
            }
            if (a.info.key !== b.info.key) {
                return applySortDirection(a.info.key.localeCompare(b.info.key), playlistSortDirection);
            }
            return 0;
        });

        const trackItems: LibraryTrackListItem[] = [];
        let viewIndex = 0;
        for (const group of sortedGroups) {
            trackItems.push({
                id: `sep-album-${group.info.key}`,
                title: `— ${group.info.displayName} —`,
                artist: "",
                album: "",
                duration: "",
                isSeparator: true,
            });

            const groupTracks = sortAlbumGroupTracks(group.tracks, playlistSort, playlistSortDirection);
            for (const track of groupTracks) {
                trackItems.push(toTrackItem(track, viewIndex));
                viewIndex += 1;
            }
        }

        return { trackItems };
    }

    if (selectedView === "songs") {
        const sortedTracks = sortTracksByMode(filteredTracks, playlistSort, playlistSortDirection);
        return {
            trackItems: sortedTracks.map((track, index) => toTrackItem(track, index)),
        };
    }

    if (selectedView === "playlist") {
        if (!selectedPlaylistId) {
            return { trackItems: [] as LibraryTrackListItem[] };
        }

        const shouldApplySort = playlistSort !== "playlist-order" || playlistSortDirection === "desc";
        const sortTracks = (inputTracks: LibraryTrack[]) => {
            if (!shouldApplySort) {
                return inputTracks;
            }

            return sortTracksByMode(inputTracks, playlistSort, playlistSortDirection);
        };

        const usedIds = new Set<string>();
        const makeUniqueId = (baseId: string) => {
            if (!usedIds.has(baseId)) {
                usedIds.add(baseId);
                return baseId;
            }

            let attempt = 2;
            let candidate = `${baseId}-${attempt}`;
            while (usedIds.has(candidate)) {
                attempt += 1;
                candidate = `${baseId}-${attempt}`;
            }
            usedIds.add(candidate);
            return candidate;
        };

        const buildPlaylistItems = (playlistTracks: LibraryTrack[]) => {
            const filteredTracks = normalizedQuery ? playlistTracks.filter(matchesQuery) : playlistTracks;
            const displayTracks = sortTracks(filteredTracks);
            return displayTracks.map((track, index) => {
                const baseItem = toTrackItem(track, index);
                const uniqueId = makeUniqueId(baseItem.id);
                if (uniqueId === baseItem.id) {
                    return baseItem;
                }
                return { ...baseItem, id: uniqueId };
            });
        };

        const playlist = playlists.find((pl) => pl.id === selectedPlaylistId);
        if (!playlist) {
            return { trackItems: [] as LibraryTrackListItem[] };
        }

        const trackLookup = buildTrackLookup(tracks);
        const makeMissingTrack = (path: string, titleOverride?: string, addedAt?: number): LibraryTrack => {
            const fileName = path.split("/").pop() || path;
            return {
                id: path,
                title: titleOverride || fileName,
                artist: "Missing Track",
                album: "",
                duration: "",
                filePath: path,
                fileName,
                isMissing: true,
                addedAt,
            };
        };

        const playlistEntries: { filePath: string; title: string; addedAt?: number }[] = playlist.tracks
            ? playlist.tracks.map((entry) => ({
                  filePath: entry.filePath,
                  title: entry.title,
                  addedAt: entry.addedAt,
              }))
            : playlist.trackPaths.map((path) => ({
                  filePath: path,
                  title: path.split("/").pop() || path,
                  addedAt: undefined,
              }));

        const orderedTracks: LibraryTrack[] = playlistEntries.map((entry) => {
            const resolved = trackLookup.get(entry.filePath) as LibraryTrack | undefined;
            if (resolved) {
                if (entry.addedAt != null) {
                    return { ...resolved, addedAt: entry.addedAt };
                }
                return resolved;
            }

            return makeMissingTrack(entry.filePath, entry.title, entry.addedAt);
        });

        return {
            trackItems: buildPlaylistItems(orderedTracks),
        };
    }

    return {
        trackItems: filteredTracks.map((track, index) => toTrackItem(track, index)),
    };
}

export function useLibraryTrackList(): UseLibraryTrackListResult {
    const selectedView = useValue(libraryUI$.selectedView);
    const selectedPlaylistId = useValue(libraryUI$.selectedPlaylistId);
    const searchQuery = useValue(libraryUI$.searchQuery);
    const playlistSort = useValue(libraryUI$.playlistSort);
    const playlistSortDirection = useValue(libraryUI$.playlistSortDirection);
    const allTracks = useValue(library$.tracks);
    const playlists = useValue(localMusicState$.playlists);
    const skipClickRef = useRef(false);

    const { trackItems } = useMemo(
        () =>
            buildTrackItems({
                tracks: allTracks,
                playlists,
                selectedView,
                selectedPlaylistId,
                searchQuery,
                playlistSort,
                playlistSortDirection,
            }),
        [
            allTracks,
            playlists,
            playlistSort,
            playlistSortDirection,
            searchQuery,
            selectedPlaylistId,
            selectedView,
        ],
    );

    const isSearchActive = searchQuery.trim().length > 0;
    const selectedPlaylist =
        selectedView === "playlist" && selectedPlaylistId
            ? (playlists.find((pl) => pl.id === selectedPlaylistId) ?? null)
            : null;
    const isPlaylistEditable =
        selectedView === "playlist" &&
        selectedPlaylist !== null &&
        selectedPlaylist.source === "cache" &&
        !isSearchActive &&
        playlistSort === "playlist-order" &&
        playlistSortDirection === "asc";

    const handleDeleteSelection = useCallback(
        (indices: number[]) => {
            if (!selectedPlaylist || !isPlaylistEditable || selectedView !== "playlist") {
                return;
            }

            const indicesToRemove = new Set(indices);
            const previousPaths = [...selectedPlaylist.trackPaths];
            const nextPaths = previousPaths.filter((_path, index) => !indicesToRemove.has(index));
            const removedCount = previousPaths.length - nextPaths.length;
            if (removedCount <= 0) {
                return;
            }

            saveLocalPlaylistTracks(selectedPlaylist, nextPaths);

            showToast(
                `Removed ${removedCount} ${removedCount === 1 ? "track" : "tracks"} from ${selectedPlaylist.name}`,
                "info",
                {
                    label: "Undo",
                    onPress: () => {
                        const latestPlaylist =
                            localMusicState$.playlists.peek().find((pl) => pl.id === selectedPlaylist.id) ??
                            selectedPlaylist;
                        saveLocalPlaylistTracks(latestPlaylist, previousPaths);
                    },
                },
            );
        },
        [isPlaylistEditable, selectedPlaylist, selectedView],
    );

    const selectionOptions =
        selectedView === "playlist" && selectedPlaylist && isPlaylistEditable
            ? { items: trackItems, onDeleteSelection: handleDeleteSelection }
            : { items: trackItems };

    const {
        selectedIndices$,
        handleTrackClick: handleSelectionClick,
        clearSelection,
        syncSelectionAfterReorder,
    } = usePlaylistSelection(selectionOptions);

    useObserveEffect(() => {
        libraryUI$.selectedView.get();
        libraryUI$.selectedPlaylistId.get();
        libraryUI$.playlistSort.get();
        libraryUI$.playlistSortDirection.get();
        library$.tracks.get().length;
        clearSelection();
    });

    useEffect(() => {
        clearSelection();
    }, [trackItems.length]);

    const handleTrackAction = useCallback(
        (index: number, action: QueueAction) => {
            const track = trackItems[index]?.sourceTrack;
            if (!track) {
                return;
            }

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
        },
        [trackItems],
    );

    const trackContextMenuItems = useMemo(
        () =>
            buildTrackContextMenuItems({
                includeQueueActions: true,
                includeFinder: true,
                extraItems: [ADD_TO_PLAYLIST_MENU_ITEM],
            }),
        [],
    );

    const handleTrackContextMenu = useCallback(
        async (index: number, event: NativeMouseEvent) => {
            const x = event.pageX ?? event.x ?? 0;
            const y = event.pageY ?? event.y ?? 0;

            const selection = await showContextMenu(trackContextMenuItems, { x, y });

            await handleTrackContextMenuSelection({
                selection,
                filePath: trackItems[index]?.sourceTrack?.filePath,
                onQueueAction: (action) => {
                    handleTrackAction(index, action === "play-next" ? "play-next" : "enqueue");
                },
                onCustomSelect: async (customSelection) => {
                    if (customSelection !== ADD_TO_PLAYLIST_MENU_ITEM.id) {
                        return;
                    }

                    const selectablePlaylists = playlists.filter(
                        (playlist) => playlist.source === "cache" && Boolean(playlist.filePath),
                    );
                    if (selectablePlaylists.length === 0) {
                        showToast("No editable playlists available", "error");
                        return;
                    }

                    const playlistSelectionItems: ContextMenuItem[] = playlists.map((playlist) => ({
                        id: `playlist:${playlist.id}`,
                        title: playlist.name,
                        enabled: playlist.source === "cache" && Boolean(playlist.filePath),
                    }));
                    const playlistSelection = await showContextMenu(playlistSelectionItems, { x, y });
                    if (!playlistSelection?.startsWith("playlist:")) {
                        return;
                    }

                    const playlistId = playlistSelection.replace(/^playlist:/, "");
                    const currentSelection = selectedIndices$.get();
                    const indicesToAdd =
                        currentSelection.size > 0 && currentSelection.has(index)
                            ? Array.from(currentSelection).sort((a, b) => a - b)
                            : [index];

                    const trackPaths = indicesToAdd
                        .map((trackIndex) => trackItems[trackIndex]?.sourceTrack?.filePath)
                        .filter((path): path is string => Boolean(path));
                    if (trackPaths.length === 0) {
                        return;
                    }

                    try {
                        const { addedPaths, playlist } = await addTracksToPlaylist(playlistId, trackPaths);
                        const addedCount = addedPaths.length;
                        if (addedCount <= 0) {
                            showToast("No new tracks to add", "info");
                            return;
                        }

                        showToast(
                            `Added ${addedCount} ${addedCount === 1 ? "track" : "tracks"} to ${playlist.name}`,
                            "info",
                            {
                                label: "Undo",
                                onPress: () => {
                                    const latestPlaylist =
                                        localMusicState$.playlists.peek().find((pl) => pl.id === playlist.id) ?? null;
                                    if (!latestPlaylist) {
                                        return;
                                    }

                                    const addedKeys = new Set(addedPaths.map((path) => path.toLowerCase()));
                                    const nextPaths = latestPlaylist.trackPaths.filter(
                                        (path) => !addedKeys.has(path.toLowerCase()),
                                    );
                                    saveLocalPlaylistTracks(latestPlaylist, nextPaths);
                                },
                            },
                        );
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to add tracks to playlist";
                        showToast(message, "error");
                    }
                },
            });
        },
        [handleTrackAction, playlists, selectedIndices$, trackItems, trackContextMenuItems],
    );

    const handleNativeDragStart = useCallback(() => {
        skipClickRef.current = true;
    }, []);

    const getSelectionIndicesForDrag = useCallback(
        (activeIndex: number) => {
            const currentSelection = selectedIndices$.get();
            if (currentSelection.size > 1 && currentSelection.has(activeIndex)) {
                return Array.from(currentSelection).sort((a, b) => a - b);
            }

            return [activeIndex];
        },
        [selectedIndices$],
    );

    const buildDragData = useCallback(
        (activeIndex: number): MediaLibraryDragData => {
            const indices = getSelectionIndicesForDrag(activeIndex);
            const tracksToInclude = indices
                .map((trackIndex) => trackItems[trackIndex]?.sourceTrack)
                .filter((track): track is LibraryTrack => Boolean(track))
                .map((track) => ({ ...track }));

            const activeTrack = trackItems[activeIndex]?.sourceTrack;
            if (tracksToInclude.length === 0 && activeTrack) {
                tracksToInclude.push({ ...activeTrack });
            }

            return {
                type: "media-library-tracks",
                tracks: tracksToInclude,
            };
        },
        [getSelectionIndicesForDrag, trackItems],
    );

    const handleTrackClick = useCallback(
        (index: number, event?: NativeMouseEvent) => {
            if (skipClickRef.current) {
                skipClickRef.current = false;
                return;
            }

            handleSelectionClick(index, event);
        },
        [handleSelectionClick],
    );

    const handleTrackDoubleClick = useCallback(
        (index: number, event?: NativeMouseEvent) => {
            if (skipClickRef.current) {
                skipClickRef.current = false;
                return;
            }

            handleSelectionClick(index, event);

            if (event?.metaKey || event?.ctrlKey) {
                return;
            }

            const action = getQueueAction({ event });
            handleTrackAction(index, action);
        },
        [handleSelectionClick, handleTrackAction],
    );

    const keyExtractor = useCallback((item: TrackListItem) => item.id, []);

    return {
        tracks: trackItems,
        selectedIndices$,
        handleTrackClick,
        handleTrackDoubleClick,
        handleTrackContextMenu,
        handleTrackQueueAction: handleTrackAction,
        syncSelectionAfterReorder,
        handleNativeDragStart,
        buildDragData,
        keyExtractor,
    };
}

function formatDuration(value: string): string {
    if (!value) {
        return " ";
    }

    if (value.includes(":")) {
        return value;
    }

    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) {
        return value;
    }

    const mins = Math.floor(numeric / 60);
    const secs = Math.round(numeric % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}
