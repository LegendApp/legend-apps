import { LegendList } from "@legendapp/list/react-native";
import { useObserveEffect, useValue } from "@legendapp/state/react";
import { type ElementRef, useCallback, useMemo, useRef, useState } from "react";
import { findNodeHandle, type GestureResponderEvent, Platform, StyleSheet, Text, UIManager, View } from "react-native";
import { Button } from "@/components/Button";
import { localAudioControls, localPlayerState$, type QueuedTrack, queue$ } from "@/components/LocalAudioPlayer";
import { showToast } from "@/components/Toast";
import { type TrackData, TrackItem } from "@/components/TrackItem";
import { usePlaylistSelection } from "@/hooks/usePlaylistSelection";
import { showContextMenu } from "@legend-desktop/context-menu";
import {
    DragDropView,
    type NativeDragTrack,
    type TrackDragEnterEvent,
    type TrackDragEvent,
    TrackDragSource,
} from "@legend-desktop/drag-drop";
import { isSupportedAudioFile, SUPPORTED_AUDIO_EXTENSIONS } from "@/systems/audioFormats";
import { DEBUG_PLAYLIST_LOGS } from "@/systems/constants";
import type { LocalTrack } from "@/systems/LocalMusicState";
import {
    createLocalTrackFromFile,
    DEFAULT_LOCAL_PLAYLIST_ID,
    ensureLocalTrackThumbnail,
    librarySettings$,
    loadTracksForDirectories,
    localMusicState$,
    scanLocalMusic,
    setCurrentPlaylist,
} from "@/systems/LocalMusicState";
import { settings$ } from "@/systems/Settings";
import { state$, stateSaved$ } from "@/systems/State";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";
import { cn } from "@legend-desktop/classnames";
import { perfCount, perfLog } from "@/utils/perfLogger";
import { buildTrackContextMenuItems, handleTrackContextMenuSelection } from "@/utils/trackContextMenu";
import {
    type DragData,
    DraggableItem,
    type DraggedItem,
    DroppableZone,
    MEDIA_LIBRARY_DRAG_ZONE_ID,
    PLAYLIST_DRAG_ZONE_ID,
    type PlaylistDragData,
} from "./dnd";
import { useDragDrop } from "./dnd/DragDropContext";

type PlaylistTrackWithSuggestions = TrackData & {
    queueEntryId: string;
    fromSuggestions?: true;
    isSeparator?: boolean;
    filePath: string;
    fileName: string;
    isMissing?: boolean;
};

interface DropFeedback {
    type: "success" | "warning";
    message: string;
}

type LegendListHandle = ElementRef<typeof LegendList> & {
    scrollIndexIntoView?: (params: { index: number; animated?: boolean }) => void;
    scrollToIndex?: (params: { index: number; animated?: boolean }) => void;
};
const debugPlaylistLog = (...args: unknown[]) => {
    if (DEBUG_PLAYLIST_LOGS) {
        console.log(...args);
    }
};

const normalizeTrackPath = (path: string): string => {
    if (!path) {
        return "";
    }
    const withoutPrefix = path.startsWith("file://") ? path.slice("file://".length) : path;
    return withoutPrefix.replace(/\/+$/, "").toLowerCase();
};

export function Playlist() {
    perfCount("Playlist.render");
    const localMusicState = useValue(localMusicState$);
    const libraryPaths = useValue(librarySettings$.paths);
    const queueTracks = useValue(queue$.tracks);
    const currentTrackIndex = useValue(localPlayerState$.currentIndex);
    const currentTrack = useValue(localPlayerState$.currentTrack);
    const isPlayerActive = useValue(localPlayerState$.isPlaying);
    const playlistStyle = useValue(settings$.general.playlistStyle);
    const queueLength = queueTracks.length;
    const hasConfiguredLibrary = libraryPaths.length > 0;
    const hasLibraryTracks = localMusicState.tracks.length > 0;
    const isDefaultPlaylistSelected = localMusicState.isLocalFilesSelected;
    const existingTrackPathSet = useMemo(() => {
        const set = new Set<string>();
        for (const track of localMusicState.tracks) {
            const normalized = normalizeTrackPath(track.filePath);
            if (normalized) {
                set.add(normalized);
            }
        }
        return set;
    }, [localMusicState.tracks]);
    const [isDragOver, setIsDragOver] = useState(false);
    const skipClickRef = useRef(false);
    const skipBackgroundClearRef = useRef(false);
    const activeNativePlaylistDragRef = useRef<string | null>(null);
    const listRef = useRef<LegendListHandle>(null);
    const dropAreaRef = useRef<ElementRef<typeof DragDropView>>(null);
    const dropAreaWindowRectRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
    const lastDropIndexRef = useRef<number>(queueLength);
    const currentTrackQueueEntryId = (currentTrack as Partial<QueuedTrack> | null)?.queueEntryId ?? null;
    const previousScrolledTrackRef = useRef<{ index: number; queueEntryId: string | null }>({
        index: typeof currentTrackIndex === "number" ? currentTrackIndex : -1,
        queueEntryId: currentTrackQueueEntryId,
    });
    const wasPlayingRef = useRef<boolean>(isPlayerActive);
    const { draggedItem$, activeDropZone$, checkDropZones } = useDragDrop();
    const handleOpenLibrarySettings = useCallback(() => {
        perfLog("Playlist.openLibrarySettingsCTA");
        state$.assign({
            showSettings: true,
            showSettingsPage: "library",
        });
    }, []);

    // Render the active playback queue
    const playlist: PlaylistTrackWithSuggestions[] = useMemo(
        () =>
            queueTracks.map((track, index) => {
                const isNowPlaying =
                    (currentTrackQueueEntryId && track.queueEntryId === currentTrackQueueEntryId) ||
                    index === currentTrackIndex;
                const normalizedPath = normalizeTrackPath(track.filePath);
                const isMissing =
                    track.isMissing ||
                    (hasLibraryTracks && normalizedPath ? !existingTrackPathSet.has(normalizedPath) : false);
                return {
                    id: track.id,
                    title: track.title,
                    artist: track.artist,
                    duration: track.duration,
                    thumbnail: track.thumbnail || "",
                    filePath: track.filePath,
                    fileName: track.fileName,
                    index,
                    isPlaying: isNowPlaying,
                    queueEntryId: track.queueEntryId,
                    isMissing,
                };
            }),
        [queueTracks, currentTrackIndex, currentTrackQueueEntryId, hasLibraryTracks, existingTrackPathSet],
    );

    const playlistContextMenuItems = useMemo(
        () =>
            buildTrackContextMenuItems({
                includeFinder: true,
            }),
        [],
    );

    const handleDeleteSelection = useCallback((indices: number[]) => {
        if (indices.length === 0) {
            return;
        }

        perfLog("Playlist.handleDeleteSelection", { count: indices.length });
        localAudioControls.queue.remove(indices);
    }, []);

    const {
        selectedIndices$,
        handleTrackClick: handleTrackClickBase,
        syncSelectionAfterReorder,
        clearSelection,
    } = usePlaylistSelection({
        items: playlist,
        onDeleteSelection: handleDeleteSelection,
    });

    const handleTrackClick = useCallback(
        (index: number, event?: Parameters<typeof handleTrackClickBase>[1]) => {
            if (skipClickRef.current) {
                skipClickRef.current = false;
                return;
            }
            handleTrackClickBase(index, event);
        },
        [handleTrackClickBase],
    );

    const handleTrackContextMenu = useCallback(
        async (index: number, event: NativeMouseEvent) => {
            const x = event.pageX ?? event.x ?? 0;
            const y = event.pageY ?? event.y ?? 0;

            const selection = await showContextMenu(playlistContextMenuItems, { x, y });

            await handleTrackContextMenuSelection({
                selection,
                filePath: playlist[index]?.filePath,
            });
        },
        [playlist, playlistContextMenuItems],
    );

    const handleTrackMouseDown = useCallback(
        (_index: number, event: NativeMouseEvent) => {
            if (event.button !== 0) {
                return;
            }
            skipBackgroundClearRef.current = true;
        },
        [skipBackgroundClearRef],
    );

    const handlePlaylistBackgroundMouseDown = useCallback(
        (event: GestureResponderEvent) => {
            const nativeEvent = event.nativeEvent as unknown as NativeMouseEvent;
            if (nativeEvent.button !== 0) {
                return;
            }

            if (skipBackgroundClearRef.current) {
                skipBackgroundClearRef.current = false;
                return;
            }

            if (selectedIndices$.get().size === 0) {
                return;
            }

            clearSelection();
            skipBackgroundClearRef.current = false;
        },
        [clearSelection, selectedIndices$, skipBackgroundClearRef],
    );

    const handleReorderDragStart = useCallback(() => {
        skipClickRef.current = true;
    }, []);

    const updateDropAreaWindowRect = useCallback(() => {
        const node = dropAreaRef.current;
        if (!node) {
            return;
        }

        const updateRect = (x: number, y: number, width: number, height: number) => {
            dropAreaWindowRectRef.current = { x, y, width, height };
        };

        if ("measureInWindow" in node && typeof node.measureInWindow === "function") {
            node.measureInWindow((x, y, width, height) => {
                updateRect(x, y, width, height);
            });
            return;
        }

        const handle = findNodeHandle(node);
        if (handle != null) {
            UIManager.measure(handle, (_x, _y, width, height, pageX, pageY) => {
                updateRect(pageX, pageY, width, height);
            });
        }
    }, []);

    const handleNativeDragStart = useCallback(
        (queueEntryId?: string) => {
            skipClickRef.current = true;
            if (!queueEntryId) {
                return;
            }

            const dragItem: DraggedItem<DragData> = {
                id: queueEntryId,
                sourceZoneId: PLAYLIST_DRAG_ZONE_ID,
                data: {
                    type: "playlist-track",
                    queueEntryId,
                },
            };

            draggedItem$.set(dragItem);
            activeDropZone$.set(null);
            lastDropIndexRef.current = queueLength;
            updateDropAreaWindowRect();
            requestAnimationFrame(updateDropAreaWindowRect);
            activeNativePlaylistDragRef.current = queueEntryId;
        },
        [activeDropZone$, draggedItem$, queueLength, updateDropAreaWindowRect],
    );

    const showDropFeedback = useCallback((feedback: DropFeedback) => {
        showToast(feedback.message, feedback.type === "warning" ? "error" : "info");
    }, []);

    const handleAddLibraryTracks = useCallback(() => {
        perfLog("Playlist.openLibraryFromEmptyState");
        stateSaved$.libraryIsOpen.set(true);
    }, []);

    const toWindowCoordinates = useCallback((location: { x: number; y: number }) => {
        const rect = dropAreaWindowRectRef.current;
        const clampedX = Math.max(0, Math.min(location.x, rect.width));
        const clampedY = Math.max(0, Math.min(location.y, rect.height));
        return {
            x: rect.x + clampedX,
            y: rect.y + clampedY,
        };
    }, []);

    useObserveEffect(() => {
        const queueLength = queue$.tracks.get().length;
        lastDropIndexRef.current = Math.min(lastDropIndexRef.current, queueLength);
        updateDropAreaWindowRect();
    });

    useObserveEffect(() => {
        const nextIndex = localPlayerState$.currentIndex.get();
        const queueEntryId =
            (localPlayerState$.currentTrack.get() as Partial<QueuedTrack> | null)?.queueEntryId ?? null;
        const previous = previousScrolledTrackRef.current;
        const trackChanged =
            queueEntryId != null
                ? queueEntryId !== previous.queueEntryId
                : previous.queueEntryId != null
                  ? true
                  : nextIndex !== previous.index;

        if (nextIndex >= 0 && trackChanged) {
            requestAnimationFrame(() => {
                const list = listRef.current;

                if (list?.scrollIndexIntoView) {
                    list.scrollIndexIntoView({ index: nextIndex, animated: true });
                } else if (list?.scrollToIndex) {
                    list.scrollToIndex({ index: nextIndex, animated: true });
                }
            });
        }

        if (previous.index !== nextIndex || previous.queueEntryId !== queueEntryId) {
            previousScrolledTrackRef.current = { index: nextIndex, queueEntryId };
        }
    });

    useObserveEffect(() => {
        const isPlayerActive = localPlayerState$.isPlaying.get();
        wasPlayingRef.current = isPlayerActive;
    });

    const allowPlaylistDrop = useCallback((item: DraggedItem<DragData>) => {
        if (item.data?.type === "playlist-track") {
            return true;
        }

        if (item.data?.type === "media-library-tracks" && item.sourceZoneId === MEDIA_LIBRARY_DRAG_ZONE_ID) {
            return item.data.tracks.length > 0;
        }

        return false;
    }, []);

    const handleDropAtPosition = useCallback(
        (item: DraggedItem<DragData>, targetPosition: number) => {
            const data = item.data;
            if (!data) {
                return;
            }

            if (data.type === "playlist-track") {
                const sourceIndex = playlist.findIndex((track) => track.queueEntryId === data.queueEntryId);
                if (sourceIndex === -1) {
                    return;
                }

                const boundedTarget = Math.max(0, Math.min(targetPosition, playlist.length));

                if (
                    sourceIndex === boundedTarget ||
                    (sourceIndex < boundedTarget && sourceIndex + 1 === boundedTarget)
                ) {
                    return;
                }

                localAudioControls.queue.reorder(sourceIndex, boundedTarget);
                syncSelectionAfterReorder(sourceIndex, boundedTarget);
                return;
            }

            if (data.type === "media-library-tracks") {
                const existingQueue = queueTracks;
                const boundedTarget = Math.max(0, Math.min(targetPosition, existingQueue.length));
                const { filtered, skipped } = filterTracksForInsert(existingQueue, data.tracks);

                if (filtered.length === 0) {
                    showDropFeedback({
                        type: "warning",
                        message: "No tracks to add to the queue.",
                    });
                    return;
                }

                localAudioControls.queue.insertAt(boundedTarget, filtered, { playImmediately: false });

                if (skipped > 0) {
                    showDropFeedback({
                        type: "warning",
                        message: `Added ${formatTrackCount(filtered.length)} (skipped ${formatTrackCount(skipped)} already in queue).`,
                    });
                } else {
                    showDropFeedback({
                        type: "success",
                        message: `Added ${formatTrackCount(filtered.length)} to the queue.`,
                    });
                }
            }
        },
        [playlist, queueTracks, showDropFeedback, syncSelectionAfterReorder],
    );

    const handleNativeTracksDrop = useCallback(
        (tracks: LocalTrack[], dropIndex?: number) => {
            const { filtered, skipped } = filterTracksForInsert(queueTracks, tracks);

            if (filtered.length === 0) {
                showDropFeedback({
                    type: "warning",
                    message: "No tracks to add to the queue.",
                });
                return;
            }

            const boundedPosition = Math.max(0, Math.min(dropIndex ?? queueLength, queueLength));

            localAudioControls.queue.insertAt(boundedPosition, filtered, { playImmediately: false });

            if (skipped > 0) {
                showDropFeedback({
                    type: "warning",
                    message: `Added ${formatTrackCount(filtered.length)} (skipped ${formatTrackCount(skipped)} already in queue).`,
                });
            } else {
                showDropFeedback({
                    type: "success",
                    message: `Added ${formatTrackCount(filtered.length)} to the queue.`,
                });
            }
        },
        [queueTracks, showDropFeedback],
    );

    const handleTrackDragEnter = useCallback(
        (event: { nativeEvent: TrackDragEnterEvent }) => {
            activeDropZone$.set(null);
            const nativeTracks = event.nativeEvent.tracks ?? [];
            const playlistQueueEntryId =
                nativeTracks.find((track) => track.queueEntryId)?.queueEntryId ?? activeNativePlaylistDragRef.current;
            if (playlistQueueEntryId) {
                draggedItem$.set({
                    id: playlistQueueEntryId,
                    sourceZoneId: PLAYLIST_DRAG_ZONE_ID,
                    data: {
                        type: "playlist-track",
                        queueEntryId: playlistQueueEntryId,
                    },
                });
                updateDropAreaWindowRect();
                requestAnimationFrame(updateDropAreaWindowRect);
                lastDropIndexRef.current = queueLength;
                activeNativePlaylistDragRef.current = playlistQueueEntryId;
                return;
            }

            const tracks = convertNativeTracksToLocal(nativeTracks);
            if (tracks.length === 0) {
                draggedItem$.set(null);
                activeNativePlaylistDragRef.current = null;
                return;
            }

            draggedItem$.set({
                id: "media-library-native",
                sourceZoneId: MEDIA_LIBRARY_DRAG_ZONE_ID,
                data: {
                    type: "media-library-tracks",
                    tracks,
                },
            });
            updateDropAreaWindowRect();
            requestAnimationFrame(updateDropAreaWindowRect);
            lastDropIndexRef.current = queueLength;
        },
        [activeDropZone$, draggedItem$, queueLength, updateDropAreaWindowRect],
    );

    const handleTrackDragLeave = useCallback(() => {
        lastDropIndexRef.current = queueLength;
        draggedItem$.set(null);
        activeDropZone$.set(null);
        activeNativePlaylistDragRef.current = null;
    }, [activeDropZone$, draggedItem$, queueLength]);

    const handleTrackDragHover = useCallback(
        (event: { nativeEvent: TrackDragEvent }) => {
            const { x, y } = toWindowCoordinates(event.nativeEvent.location);
            checkDropZones(x, y);
            const activeDropZoneId = activeDropZone$.get();
            const dropIndexFromZone = parseDropZonePosition(activeDropZoneId);
            if (dropIndexFromZone !== null) {
                lastDropIndexRef.current = dropIndexFromZone;
            }
        },
        [activeDropZone$, checkDropZones, toWindowCoordinates],
    );

    const handleTrackDrop = useCallback(
        (event: { nativeEvent: TrackDragEvent }) => {
            const { tracks = [], location } = event.nativeEvent;
            const playlistQueueEntryId =
                tracks.find((track) => track.queueEntryId)?.queueEntryId ?? activeNativePlaylistDragRef.current;
            const { x, y } = toWindowCoordinates(location);
            checkDropZones(x, y);
            const activeDropZoneId = activeDropZone$.get();
            const zoneIndex = parseDropZonePosition(activeDropZoneId);
            const fallbackIndex = Math.min(lastDropIndexRef.current, queueLength);
            const dropIndex = zoneIndex !== null ? zoneIndex : fallbackIndex;
            draggedItem$.set(null);
            activeDropZone$.set(null);
            lastDropIndexRef.current = queueLength;

            if (playlistQueueEntryId) {
                const dragItem: DraggedItem<DragData> = {
                    id: playlistQueueEntryId,
                    sourceZoneId: PLAYLIST_DRAG_ZONE_ID,
                    data: {
                        type: "playlist-track",
                        queueEntryId: playlistQueueEntryId,
                    },
                };
                handleDropAtPosition(dragItem, dropIndex);
                activeNativePlaylistDragRef.current = null;
                return;
            }

            const converted = convertNativeTracksToLocal(tracks);
            handleNativeTracksDrop(converted, dropIndex);
            activeNativePlaylistDragRef.current = null;
        },
        [
            activeDropZone$,
            checkDropZones,
            draggedItem$,
            handleDropAtPosition,
            handleNativeTracksDrop,
            queueLength,
            toWindowCoordinates,
        ],
    );

    const handleTrackDoubleClick = (index: number) => {
        const track = playlist[index];

        // Don't allow clicking on separator items
        if (track?.isSeparator) {
            return;
        }

        if (__DEV__) {
            console.log("Queue -> play index", index);
        }
        handleTrackClickBase(index);
        localAudioControls.playTrackAtIndex(index);
    };

    const handleDirectoryDrop = useCallback(
        async (directories: string[]) => {
            perfLog("Playlist.handleDirectoryDrop", { directoryCount: directories.length });

            const normalized = Array.from(
                new Set(
                    directories
                        .map(normalizeDroppedPath)
                        .filter((path): path is string => typeof path === "string" && path.length > 0),
                ),
            );

            if (normalized.length === 0) {
                showDropFeedback({
                    type: "warning",
                    message: "No valid folders to add to the library.",
                });
                return;
            }

            let addedPaths: string[] = [];
            librarySettings$.paths.set((paths) => {
                const existing = new Set(paths.map(normalizeDroppedPath));
                const additions: string[] = [];

                for (const path of normalized) {
                    if (!existing.has(path)) {
                        existing.add(path);
                        additions.push(path);
                    }
                }

                if (additions.length === 0) {
                    return paths;
                }

                addedPaths = additions;
                return [...paths, ...additions];
            });

            let queuedTracks: LocalTrack[] = [];
            try {
                queuedTracks = await loadTracksForDirectories(normalized);
            } catch (error) {
                console.error("Failed to load tracks from dropped folders:", error);
            }

            if (queuedTracks.length > 0) {
                localAudioControls.queue.append(queuedTracks);
                queuedTracks.forEach((track) => {
                    void ensureLocalTrackThumbnail(track);
                });
                showDropFeedback({
                    type: "success",
                    message: `Added ${formatTrackCount(queuedTracks.length)} to the queue.`,
                });
            } else {
                showDropFeedback({
                    type: "warning",
                    message: "No audio tracks found in dropped folders.",
                });
            }

            if (addedPaths.length > 0) {
                showDropFeedback({
                    type: "success",
                    message: `Added ${formatFolderCount(addedPaths.length)} to the library.`,
                });

                scanLocalMusic().catch((error) => {
                    console.error("Failed to re-scan library after adding folders:", error);
                });
            }
        },
        [loadTracksForDirectories, showDropFeedback],
    );

    const handleFileDrop = useCallback(
        async (files: string[]) => {
            const supportedFiles = files.filter((filePath) => isSupportedAudioFile(filePath));
            const unsupportedCount = files.length - supportedFiles.length;
            perfLog("Playlist.handleFileDrop", {
                fileCount: files.length,
                supportedCount: supportedFiles.length,
            });

            if (supportedFiles.length === 0) {
                debugPlaylistLog("No supported files to add to queue");
                showDropFeedback({
                    type: "warning",
                    message: "No supported audio files to add to the queue.",
                });
                return;
            }

            try {
                const trackPromises = supportedFiles.map((filePath) =>
                    createLocalTrackFromFile(filePath).catch((error) => {
                        console.error(`Failed to load metadata for dropped file ${filePath}:`, error);
                        return null;
                    }),
                );

                const resolvedTracks = await Promise.all(trackPromises);
                const tracksToAdd = resolvedTracks.filter((track): track is LocalTrack => track !== null);
                const skippedMetadata = supportedFiles.length - tracksToAdd.length;
                const skipped = unsupportedCount + skippedMetadata;

                if (tracksToAdd.length === 0) {
                    showDropFeedback({
                        type: "warning",
                        message: "No supported audio files to add to the queue.",
                    });
                    return;
                }

                localAudioControls.queue.append(tracksToAdd);
                tracksToAdd.forEach((track) => {
                    void ensureLocalTrackThumbnail(track);
                });

                if (!hasConfiguredLibrary && !isDefaultPlaylistSelected) {
                    setCurrentPlaylist(DEFAULT_LOCAL_PLAYLIST_ID, "file");
                }

                const additionSummary = `Added ${formatTrackCount(tracksToAdd.length)}`;
                const persistenceHint = hasConfiguredLibrary
                    ? ""
                    : " Add a library folder in Settings to keep them around next time.";

                if (skipped > 0) {
                    const skippedFilesSummary = formatTrackCount(skipped);
                    showDropFeedback({
                        type: "warning",
                        message:
                            `${additionSummary} (skipped ${skippedFilesSummary} unsupported or unreadable files).` +
                            `${persistenceHint}`,
                    });
                } else {
                    showDropFeedback({
                        type: "success",
                        message: `${additionSummary} to the queue.${persistenceHint}`,
                    });
                }

                debugPlaylistLog(`Added ${tracksToAdd.length} files to queue`);
            } catch (error) {
                console.error("Error adding dropped files to queue:", error);
                showDropFeedback({
                    type: "warning",
                    message: "Failed to add dropped files to the queue.",
                });
            }
        },
        [hasConfiguredLibrary, isDefaultPlaylistSelected, setCurrentPlaylist, showDropFeedback],
    );

    const handleDragEnter = useCallback(() => {
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (event: { nativeEvent: { files: string[]; directories?: string[] } }) => {
            setIsDragOver(false);
            const { files = [], directories = [] } = event.nativeEvent;
            if (directories.length > 0) {
                void handleDirectoryDrop(directories);
            }
            if (files.length > 0) {
                handleFileDrop(files);
            }
        },
        [handleDirectoryDrop, handleFileDrop],
    );

    // Initialize selected index when playlist changes
    // useEffect(() => {
    //     if (playlist.length > 0 && selectedIndex === -1) {
    //         setSelectedIndex(0);
    //     } else if (playlist.length === 0) {
    //         setSelectedIndex(-1);
    //     } else if (selectedIndex >= playlist.length) {
    //         setSelectedIndex(playlist.length - 1);
    //     }
    // }, [playlist.length, selectedIndex]);

    // Update global navigation state
    // useEffect(() => {
    //     playlistNavigationState$.hasSelection.set(playlist.length > 0 && selectedIndex !== -1);
    // }, [playlist.length, selectedIndex]);

    const isQueueEmpty = playlist.length === 0;

    const overlayClassName = cn(
        isQueueEmpty && !isDragOver && "bg-white/5",
        isDragOver && "bg-blue-500/20 border-dashed",
    );

    const emptyStateContent = isQueueEmpty ? (
        localMusicState.isScanning ? (
            <>
                <Text className="text-white font-medium text-base">Scanning your library…</Text>
                <Text className="text-white/70 text-sm mt-2">
                    {localMusicState.scanTrackTotal > 0 &&
                    localMusicState.scanTrackTotal >= localMusicState.scanTrackProgress &&
                    localMusicState.scanTrackProgress > 0
                        ? `${localMusicState.scanTrackProgress}/${localMusicState.scanTrackTotal} tracks`
                        : `${localMusicState.scanTrackProgress} tracks processed`}
                </Text>
                {localMusicState.scanTotal > 0 ? (
                    <Text className="text-white/50 text-xs mt-1">
                        Folders {localMusicState.scanProgress}/{localMusicState.scanTotal}
                    </Text>
                ) : null}
                <Text className="text-white/50 text-xs mt-4 text-center max-w-sm">
                    You can still drag songs or folders here while we finish scanning.
                </Text>
                {isDragOver ? (
                    <Text className="text-blue-300 text-sm mt-6 font-medium">Drop to add these tracks</Text>
                ) : null}
            </>
        ) : hasLibraryTracks ? (
            <>
                <Text className="text-white font-semibold text-base">No tracks queued yet</Text>
                <Text className="text-white/70 text-xs mt-2 text-center max-w-sm">
                    Open your library to pick what plays next.
                </Text>
                <Button variant="primary" size="small" className="mt-4" onClick={handleAddLibraryTracks}>
                    <Text className="text-white text-sm">Open Media Library</Text>
                </Button>
                {isDragOver ? (
                    <Text className="text-blue-300 text-sm mt-6 font-medium">Drop to add these tracks</Text>
                ) : null}
            </>
        ) : (
            <>
                <Text className="text-white font-semibold text-base">Add music to get started</Text>
                <Text className="text-white/70 text-sm mt-2 text-center max-w-sm">
                    Drag songs or folders here, or choose your library folders.
                </Text>
                <Button variant="primary" size="small" className="mt-4" onClick={handleOpenLibrarySettings}>
                    <Text className="text-white text-sm">Open Library Settings</Text>
                </Button>
            </>
        )
    ) : null;

    const getFixedItemSize = useCallback(() => {
        return playlistStyle === "compact" ? 32 : 50;
    }, [playlistStyle]);

    return (
        <View
            className="flex-1"
            style={styles.flex}
            onStartShouldSetResponderCapture={(event) => {
                handlePlaylistBackgroundMouseDown(event);
                return false;
            }}
        >
            <DragDropView
                ref={dropAreaRef}
                className={cn("flex-1", overlayClassName)}
                style={styles.flex}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onTrackDragEnter={handleTrackDragEnter}
                onTrackDragLeave={handleTrackDragLeave}
                onTrackDragHover={handleTrackDragHover}
                onTrackDrop={handleTrackDrop}
                onLayout={() => {
                    requestAnimationFrame(updateDropAreaWindowRect);
                }}
                allowedFileTypes={[...SUPPORTED_AUDIO_EXTENSIONS]}
            >
                {emptyStateContent ? (
                    <View className="flex-1 items-center justify-center px-8 text-center">{emptyStateContent}</View>
                ) : (
                    <>
                        {isDragOver && (
                            <View className="absolute inset-0 z-10 flex-1 items-center justify-center">
                                <View className="bg-blue-500 px-4 py-2 rounded-lg">
                                    <Text className="text-white font-medium">Drop files to add to queue</Text>
                                </View>
                            </View>
                        )}
                        <LegendList
                            ref={listRef}
                            data={playlist}
                            style={{ flex: 1 }}
                            keyExtractor={(item, index) => `queue-${item.queueEntryId ?? item.id ?? index}`}
                            contentContainerStyle={styles.container}
                            getFixedItemSize={getFixedItemSize}
                            ListHeaderComponent={
                                <PlaylistDropZone
                                    position={0}
                                    allowDrop={allowPlaylistDrop}
                                    onDrop={handleDropAtPosition}
                                />
                            }
                            recycleItems
                            renderItem={({ item: track, index }) => {
                            const trackContent = (
                                <TrackItem
                                    track={track}
                                    index={index}
                                    onClick={handleTrackClick}
                                    onDoubleClick={handleTrackDoubleClick}
                                    selectedIndices$={selectedIndices$}
                                    onMouseDown={handleTrackMouseDown}
                                    onRightClick={handleTrackContextMenu}
                                    disableHover
                                    artistMaxWidth="50%"
                                />
                            );

                            if (Platform.OS === "macos") {
                                return (
                                    <View>
                                        <TrackDragSource
                                            tracks={[convertTrackToNativeDrag(track)]}
                                            onDragStart={() => handleNativeDragStart(track.queueEntryId)}
                                            className="w-full"
                                        >
                                            {trackContent}
                                        </TrackDragSource>
                                        <PlaylistDropZone
                                            position={index + 1}
                                            allowDrop={allowPlaylistDrop}
                                            onDrop={handleDropAtPosition}
                                        />
                                    </View>
                                );
                            }

                            return (
                                <View>
                                    <DraggableItem
                                        id={track.queueEntryId}
                                        zoneId={PLAYLIST_DRAG_ZONE_ID}
                                        data={
                                            {
                                                type: "playlist-track",
                                                queueEntryId: track.queueEntryId,
                                            } satisfies PlaylistDragData
                                        }
                                        onDragStart={handleReorderDragStart}
                                        className="w-full"
                                    >
                                        {trackContent}
                                    </DraggableItem>
                                    <PlaylistDropZone
                                        position={index + 1}
                                        allowDrop={allowPlaylistDrop}
                                        onDrop={handleDropAtPosition}
                                    />
                                </View>
                            );
                        }}
                        />
                    </>
                )}
            </DragDropView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        // paddingVertical: 2,
    },
    flex: {
        flex: 1,
    },
});

function parseDropZonePosition(id: string | null): number | null {
    if (!id || !id.startsWith("playlist-drop-")) {
        return null;
    }

    const value = Number.parseInt(id.replace("playlist-drop-", ""), 10);
    return Number.isFinite(value) ? value : null;
}

function normalizeDroppedPath(path: string): string {
    if (!path) {
        return "";
    }

    let normalized = path;

    if (normalized.startsWith("file://")) {
        try {
            const url = new URL(normalized);
            normalized = decodeURI(url.pathname);
        } catch (error) {
            console.warn("Failed to parse dropped path URL:", normalized, error);
            normalized = normalized.replace(/^file:\/\//, "");
        }
    }

    if (normalized.length === 0) {
        return "";
    }

    const trimmed = normalized.replace(/\/+$/, "");
    if (trimmed.length === 0) {
        return "/";
    }

    return trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed) ? trimmed : `/${trimmed}`;
}

function formatTrackCount(count: number): string {
    return `${count} track${count === 1 ? "" : "s"}`;
}

function formatFolderCount(count: number): string {
    return `${count} folder${count === 1 ? "" : "s"}`;
}

function convertNativeTracksToLocal(tracks: NativeDragTrack[] = []): LocalTrack[] {
    return tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration ?? "0:00",
        filePath: track.filePath ?? track.id,
        fileName: track.fileName ?? track.title,
        thumbnail: track.thumbnail,
    }));
}

function convertTrackToNativeDrag(track: TrackData): NativeDragTrack {
    return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        filePath: undefined,
        fileName: undefined,
        thumbnail: track.thumbnail,
        queueEntryId: track.queueEntryId,
    };
}

interface TrackIdentity {
    id?: string;
    filePath?: string;
    queueEntryId?: string;
}

export function filterTracksForInsert(
    _existingQueue: TrackIdentity[],
    incomingTracks: LocalTrack[],
): { filtered: LocalTrack[]; skipped: number } {
    // Duplicates are allowed in the queue, so return a copy of the incoming tracks.
    return { filtered: incomingTracks.slice(), skipped: 0 };
}

interface PlaylistDropZoneProps {
    position: number;
    allowDrop: (item: DraggedItem<DragData>) => boolean;
    onDrop: (item: DraggedItem<DragData>, position: number) => void;
}

function PlaylistDropZone({ position, allowDrop, onDrop }: PlaylistDropZoneProps) {
    const dropId = `playlist-drop-${position}`;
    const isFirstZone = position === 0;

    return (
        <DroppableZone
            id={dropId}
            allowDrop={(item) => allowDrop(item as DraggedItem<DragData>)}
            onDrop={(item) => onDrop(item as DraggedItem<DragData>, position)}
        >
            {(isActive) => (
                <View
                    pointerEvents="none"
                    className={cn("h-[3px] rounded-full bg-blue-500", isFirstZone ? "-mb-[3px]" : "-mt-[3px]")}
                    style={{ opacity: isActive ? 1 : 0 }}
                />
            )}
        </DroppableZone>
    );
}
