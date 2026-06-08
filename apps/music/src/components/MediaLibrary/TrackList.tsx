import { LegendList } from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useCallback, useMemo } from "react";
import { Platform, Text, View } from "react-native";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";

import { AIButtons, type AIButtonsAddResult } from "@/components/AIButtons";
import { Button } from "@/components/Button";
import {
    type DragData,
    DraggableItem,
    type DraggedItem,
    DroppableZone,
    LOCAL_PLAYLIST_DRAG_ZONE_ID,
    type LocalPlaylistDragData,
    MEDIA_LIBRARY_DRAG_ZONE_ID,
    type MediaLibraryDragData,
} from "@/components/dnd";
import { localPlayerState$ } from "@/components/LocalAudioPlayer";
import { Table, TableCell, type TableColumnSpec, TableHeader, TableRow } from "@/components/Table";
import type { TrackData } from "@/components/TrackItem";
import { useListItemStyles } from "@/hooks/useListItemStyles";
import { type ContextMenuItem, showContextMenu } from "@legend-desktop/context-menu";
import { type NativeDragTrack, TrackDragSource } from "@legend-desktop/drag-drop";
import { Icon } from "@/systems/Icon";
import { libraryUI$ } from "@/systems/LibraryState";
import { type LocalTrack, localMusicState$, saveLocalPlaylistTracks } from "@/systems/LocalMusicState";
import { addTracksToPlaylist } from "@/systems/LocalPlaylists";
import { themeState$ } from "@/theme/ThemeProvider";
import { cn } from "@legend-desktop/classnames";
import type { QueueAction } from "@/utils/queueActions";
import { useLibraryTrackList } from "./useLibraryTrackList";

type TrackListProps = {};

const formatAddedDate = (timestamp?: number): string => {
    if (!timestamp) {
        return "";
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

export function TrackList(_props: TrackListProps) {
    const {
        tracks,
        selectedIndices$,
        handleTrackClick,
        handleTrackDoubleClick,
        handleTrackContextMenu,
        handleTrackQueueAction,
        syncSelectionAfterReorder,
        handleNativeDragStart,
        buildDragData,
        keyExtractor,
    } = useLibraryTrackList();

    const selectedView = useValue(libraryUI$.selectedView);
    const selectedPlaylistId = useValue(libraryUI$.selectedPlaylistId);
    const searchQuery = useValue(libraryUI$.searchQuery);
    const playlistSort = useValue(libraryUI$.playlistSort);
    const playlistSortDirection = useValue(libraryUI$.playlistSortDirection);
    const playlists = useValue(localMusicState$.playlists);
    const libraryTracks = useValue(localMusicState$.tracks);

    const nonSeparatorTrackCount = useMemo(
        () => tracks.reduce((count, track) => (track.isSeparator ? count : count + 1), 0),
        [tracks],
    );

    const selectedPlaylist = useMemo(() => {
        if (selectedView !== "playlist" || !selectedPlaylistId) {
            return null;
        }

        return playlists.find((pl) => pl.id === selectedPlaylistId) ?? null;
    }, [playlists, selectedPlaylistId, selectedView]);

    const headerConfig = useMemo(() => {
        if (selectedView === "playlist" && selectedPlaylist) {
            return { title: selectedPlaylist.name, count: selectedPlaylist.trackCount, showSort: true };
        }

        if (selectedView === "artists") {
            return { title: "Artists", count: nonSeparatorTrackCount };
        }

        if (selectedView === "albums") {
            return { title: "Albums", count: nonSeparatorTrackCount };
        }

        if (selectedView === "songs") {
            return { title: "Songs", count: nonSeparatorTrackCount };
        }

        return null;
    }, [nonSeparatorTrackCount, selectedPlaylist, selectedView]);

    const isPlaylistEditable =
        selectedView === "playlist" &&
        selectedPlaylist !== null &&
        selectedPlaylist.source === "cache" &&
        playlistSort === "playlist-order" &&
        playlistSortDirection === "asc" &&
        searchQuery.trim().length === 0;

    const handleAddAITracksToPlaylist = useCallback(
        async (tracksToAdd: LocalTrack[]): Promise<AIButtonsAddResult> => {
            if (!selectedPlaylist) {
                return { addedCount: 0 };
            }

            const { addedPaths, playlist } = await addTracksToPlaylist(
                selectedPlaylist.id,
                tracksToAdd.map((track) => track.filePath),
            );

            let undo: (() => void) | undefined;
            if (addedPaths.length > 0) {
                undo = () => {
                    const latestPlaylist =
                        localMusicState$.playlists.peek().find((candidate) => candidate.id === playlist.id) ?? null;
                    if (!latestPlaylist) {
                        return;
                    }

                    const addedKeys = new Set(addedPaths.map((path) => path.toLowerCase()));
                    const nextPaths = latestPlaylist.trackPaths.filter((path) => !addedKeys.has(path.toLowerCase()));
                    saveLocalPlaylistTracks(latestPlaylist, nextPaths);
                };
            }

            return {
                addedCount: addedPaths.length,
                targetName: playlist.name,
                undo,
            };
        },
        [selectedPlaylist],
    );

    const showDateAddedColumn = selectedView === "playlist";

    const columns = useMemo<TableColumnSpec[]>(() => {
        const nextColumns: TableColumnSpec[] = [
            { id: "number", label: "#", width: 36, align: "right", sortId: "playlist-order" },
            { id: "title", label: "Title", flex: 3, minWidth: 120, sortId: "title" },
            { id: "artist", label: "Artist", flex: 2, minWidth: 100, sortId: "artist" },
            { id: "album", label: "Album", flex: 2, minWidth: 100, sortId: "album" },
        ];

        if (showDateAddedColumn) {
            nextColumns.push({ id: "date-added", label: "Date added", width: 120, sortId: "date-added" });
        }

        nextColumns.push(
            { id: "duration", label: "Duration", width: 64, align: "right" },
            { id: "actions", width: 28, align: "center" },
        );

        return nextColumns;
    }, [showDateAddedColumn]);

    const handleColumnSort = useCallback(
        (sortId: string) => {
            if (
                sortId !== "playlist-order" &&
                sortId !== "date-added" &&
                sortId !== "title" &&
                sortId !== "artist" &&
                sortId !== "album"
            ) {
                return;
            }

            if (sortId === playlistSort) {
                const nextDirection = playlistSortDirection === "asc" ? "desc" : "asc";
                libraryUI$.playlistSortDirection.set(nextDirection);
                return;
            }

            const defaultDirection = sortId === "date-added" ? "desc" : "asc";
            libraryUI$.playlistSort.set(sortId);
            libraryUI$.playlistSortDirection.set(defaultDirection);
        },
        [playlistSort, playlistSortDirection],
    );

    const allowPlaylistDrop = useCallback(
        (item: DraggedItem<DragData>) => {
            if (!isPlaylistEditable || !selectedPlaylist) {
                return false;
            }

            const data = item.data;
            if (!data) {
                return false;
            }

            if (data.type === "local-playlist-track" && item.sourceZoneId === LOCAL_PLAYLIST_DRAG_ZONE_ID) {
                return data.playlistId === selectedPlaylist.id;
            }

            if (data.type === "media-library-tracks" && item.sourceZoneId === MEDIA_LIBRARY_DRAG_ZONE_ID) {
                return data.tracks.length > 0;
            }

            return false;
        },
        [isPlaylistEditable, selectedPlaylist],
    );

    const handleDropAtPosition = useCallback(
        async (item: DraggedItem<DragData>, targetPosition: number) => {
            if (!isPlaylistEditable || !selectedPlaylist) {
                return;
            }

            const data = item.data;
            const currentPaths = selectedPlaylist.trackPaths;
            const boundedTarget = Math.max(0, Math.min(targetPosition, currentPaths.length));

            if (data.type === "local-playlist-track") {
                if (data.playlistId !== selectedPlaylist.id) {
                    return;
                }

                const sourceIndex = Math.max(0, Math.min(data.sourceIndex, currentPaths.length - 1));
                if (
                    sourceIndex === boundedTarget ||
                    (sourceIndex < boundedTarget && sourceIndex + 1 === boundedTarget)
                ) {
                    return;
                }

                const nextPaths = currentPaths.slice();
                const [movedPath] = nextPaths.splice(sourceIndex, 1);
                const insertIndex = boundedTarget > sourceIndex ? boundedTarget - 1 : boundedTarget;
                nextPaths.splice(insertIndex, 0, movedPath);

                await saveLocalPlaylistTracks(selectedPlaylist, nextPaths);
                syncSelectionAfterReorder(sourceIndex, boundedTarget);
                return;
            }

            if (data.type === "media-library-tracks") {
                const insertPaths = data.tracks.map((track) => track.filePath);
                const nextPaths = currentPaths.slice();
                nextPaths.splice(boundedTarget, 0, ...insertPaths);
                await saveLocalPlaylistTracks(selectedPlaylist, nextPaths);
            }
        },
        [isPlaylistEditable, selectedPlaylist, syncSelectionAfterReorder],
    );

    const renderTrack = useCallback(
        ({ item, index }: { item: TrackData; index: number }) => {
            if (item.isSeparator) {
                return <LibrarySeparatorRow title={item.title} />;
            }

            const trackPathForPlaylist =
                isPlaylistEditable && selectedPlaylist ? (selectedPlaylist.trackPaths[index] ?? item.id) : null;

            const trackRow = (
                <LibraryTrackRow
                    track={item}
                    index={index}
                    columns={columns}
                    onClick={handleTrackClick}
                    onDoubleClick={handleTrackDoubleClick}
                    onRightClick={handleTrackContextMenu}
                    onMenuAction={handleTrackQueueAction}
                    selectedIndices$={selectedIndices$}
                    buildDragData={buildDragData}
                    onNativeDragStart={handleNativeDragStart}
                    isPlaylistEditable={isPlaylistEditable}
                    playlistId={selectedPlaylist?.id ?? null}
                    trackPath={trackPathForPlaylist}
                />
            );

            if (isPlaylistEditable && Platform.OS !== "macos") {
                return (
                    <View>
                        {trackRow}
                        <LocalPlaylistDropZone
                            position={index + 1}
                            allowDrop={allowPlaylistDrop}
                            onDrop={handleDropAtPosition}
                        />
                    </View>
                );
            }

            return trackRow;
        },
        [
            allowPlaylistDrop,
            buildDragData,
            handleTrackClick,
            handleTrackDoubleClick,
            handleTrackContextMenu,
            handleTrackQueueAction,
            handleNativeDragStart,
            handleDropAtPosition,
            isPlaylistEditable,
            selectedPlaylist,
            selectedIndices$,
            columns,
        ],
    );

    const getItemType = useCallback((item: TrackData) => {
        return item.isSeparator ? "separator" : "track";
    }, []);

    const getFixedItemSize = useCallback((item: TrackData, _index: number, type: string | undefined) => {
        return item.isSeparator ? 72 : 32;
    }, []);

    return (
        <View className="flex-1 pl-2 relative">
            {headerConfig ? (
                <View className="px-3 py-2 flex-row items-center gap-2">
                    <View className="flex-1 min-w-0">
                        <Text className="text-sm font-semibold text-text-primary" numberOfLines={1}>
                            {headerConfig.title}
                        </Text>
                        <Text className="text-xs text-text-secondary" numberOfLines={1}>
                            {headerConfig.count} {headerConfig.count === 1 ? "track" : "tracks"}
                        </Text>
                    </View>
                </View>
            ) : null}
            <Table
                header={
                    <TableHeader
                        columns={columns}
                        activeSortId={playlistSort}
                        activeSortDirection={playlistSortDirection}
                        onColumnClick={handleColumnSort}
                    />
                }
            >
                <LegendList
                    key={selectedView}
                    data={tracks}
                    keyExtractor={keyExtractor}
                    renderItem={renderTrack}
                    getItemType={getItemType}
                    getFixedItemSize={getFixedItemSize}
                    ListHeaderComponent={
                        isPlaylistEditable && Platform.OS !== "macos" ? (
                            <LocalPlaylistDropZone
                                position={0}
                                allowDrop={allowPlaylistDrop}
                                onDrop={handleDropAtPosition}
                            />
                        ) : undefined
                    }
                    style={{ flex: 1 }}
                    contentContainerStyle={
                        tracks.length
                            ? undefined
                            : {
                                  flexGrow: 1,
                                  justifyContent: "center",
                                  alignItems: "flex-start",
                                  paddingVertical: 16,
                              }
                    }
                    recycleItems
                    ListEmptyComponent={
                        <View className="items-center justify-center py-4 px-2.5 w-full">
                            <Text className="text-sm text-white/60">No tracks found</Text>
                        </View>
                    }
                />
            </Table>
            {selectedView === "playlist" && selectedPlaylist ? (
                <AIButtons
                    canUseAI={isPlaylistEditable}
                    libraryTracks={libraryTracks}
                    onAddTracks={handleAddAITracksToPlaylist}
                    playlist={selectedPlaylist}
                />
            ) : null}
        </View>
    );
}

function LibrarySeparatorRow({ title }: { title: string }) {
    return (
        <View className="flex items-center pt-6 pb-2 border-b border-white/10">
            <Text className="text-white/90 text-xl font-semibold" numberOfLines={1}>
                {title.replace(/^— (.+) —$/, "$1")}
            </Text>
        </View>
    );
}

interface LocalPlaylistDropZoneProps {
    position: number;
    allowDrop: (item: DraggedItem<DragData>) => boolean;
    onDrop: (item: DraggedItem<DragData>, position: number) => void;
}

function LocalPlaylistDropZone({ position, allowDrop, onDrop }: LocalPlaylistDropZoneProps) {
    const dropId = `local-playlist-drop-${position}`;
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

interface LibraryTrackRowProps {
    track: TrackData;
    index: number;
    columns: TableColumnSpec[];
    onClick: (index: number, event?: NativeMouseEvent) => void;
    onDoubleClick: (index: number, event?: NativeMouseEvent) => void;
    onRightClick: (index: number, event: NativeMouseEvent) => void;
    onMenuAction: (index: number, action: QueueAction) => void;
    selectedIndices$: Observable<Set<number>>;
    buildDragData: (activeIndex: number) => MediaLibraryDragData;
    onNativeDragStart: () => void;
    isPlaylistEditable: boolean;
    playlistId: string | null;
    trackPath: string | null;
}

const TRACK_ROW_MENU_ITEMS: ContextMenuItem[] = [
    { id: "play-now", title: "Play Now" },
    { id: "play-next", title: "Play Next" },
    { id: "star", title: "Star", enabled: false },
];

function LibraryTrackRow({
    track,
    index,
    columns,
    onClick,
    onDoubleClick,
    onRightClick,
    onMenuAction,
    selectedIndices$,
    buildDragData,
    onNativeDragStart,
    isPlaylistEditable,
    playlistId,
    trackPath,
}: LibraryTrackRowProps) {
    const dragData = buildDragData(index);
    const listItemStyles = useListItemStyles();
    const isSelected = useValue(() => selectedIndices$.get().has(index));
    const isPlaying = useValue(() => {
        const currentTrack = localPlayerState$.currentTrack.get();
        return currentTrack ? currentTrack.id === track.id : false;
    });
    const accentColor = useValue(() => themeState$.customColors.dark.accent.primary.get());
    const displayIndex = track.trackIndex;
    const numberColumn = columns.find((column) => column.id === "number") ?? columns[0];
    const titleColumn = columns.find((column) => column.id === "title") ?? columns[1];
    const artistColumn = columns.find((column) => column.id === "artist") ?? columns[2];
    const albumColumn = columns.find((column) => column.id === "album") ?? columns[3];
    const dateAddedColumn = columns.find((column) => column.id === "date-added");
    const durationColumn = columns.find((column) => column.id === "duration") ?? columns[columns.length - 2];
    const actionsColumn = columns.find((column) => column.id === "actions") ?? columns[columns.length - 1];
    const addedAtLabel = formatAddedDate(track.addedAt);

    const handleMenuClick = useCallback(
        async (event: NativeMouseEvent) => {
            const x = event.pageX ?? event.x ?? 0;
            const y = event.pageY ?? event.y ?? 0;

            const selection = await showContextMenu(TRACK_ROW_MENU_ITEMS, { x, y });
            if (!selection) {
                return;
            }

            if (selection === "play-now" || selection === "play-next") {
                onMenuAction(index, selection);
            }
        },
        [index, onMenuAction],
    );

    const row = (
        <TableRow
            className="w-full"
            isSelected={isSelected}
            isActive={isPlaying}
            onClick={(event) => onClick(index, event)}
            onDoubleClick={(event) => onDoubleClick(index, event)}
            onRightClick={(event) => onRightClick(index, event)}
        >
            <TableCell column={numberColumn}>
                {isPlaying ? (
                    <Icon name="play.fill" size={12} color={accentColor} />
                ) : displayIndex != null ? (
                    <Text className={cn("text-xs tabular-nums", listItemStyles.text.muted)}>{displayIndex}</Text>
                ) : null}
            </TableCell>
            <TableCell column={titleColumn}>
                <Text className={cn("text-sm font-medium truncate", listItemStyles.text.primary)} numberOfLines={1}>
                    {track.title}
                </Text>
            </TableCell>
            <TableCell column={artistColumn}>
                <Text className={cn("text-sm truncate", listItemStyles.text.secondary)} numberOfLines={1}>
                    {track.artist}
                </Text>
            </TableCell>
            <TableCell column={albumColumn}>
                <Text className={cn("text-sm truncate", listItemStyles.text.secondary)} numberOfLines={1}>
                    {track.album ?? ""}
                </Text>
            </TableCell>
            {dateAddedColumn ? (
                <TableCell column={dateAddedColumn}>
                    <Text className={cn("text-xs truncate", listItemStyles.text.secondary)} numberOfLines={1}>
                        {addedAtLabel || "-"}
                    </Text>
                </TableCell>
            ) : null}
            <TableCell column={durationColumn}>
                <Text className={listItemStyles.getMetaClassName({ className: "text-xs" })}>{track.duration}</Text>
            </TableCell>
            <TableCell column={actionsColumn} className="pl-1 pr-1">
                <Button
                    icon="ellipsis"
                    variant="icon"
                    size="small"
                    accessibilityLabel="Track actions"
                    onClick={handleMenuClick}
                    className="bg-transparent hover:bg-white/10"
                />
            </TableCell>
        </TableRow>
    );

    if (Platform.OS === "macos") {
        return (
            <TrackDragSource
                tracks={dragData.tracks as NativeDragTrack[]}
                onDragStart={onNativeDragStart}
                className="flex-1"
            >
                {row}
            </TrackDragSource>
        );
    }

    if (isPlaylistEditable && playlistId && trackPath) {
        const playlistDragData = {
            type: "local-playlist-track",
            playlistId,
            trackPath,
            sourceIndex: index,
        } satisfies LocalPlaylistDragData;

        return (
            <DraggableItem
                id={`local-playlist-track-${playlistId}-${index}`}
                zoneId={LOCAL_PLAYLIST_DRAG_ZONE_ID}
                data={playlistDragData}
                className="flex-1"
            >
                {row}
            </DraggableItem>
        );
    }

    return (
        <DraggableItem
            id={`library-track-${track.id}`}
            zoneId={MEDIA_LIBRARY_DRAG_ZONE_ID}
            data={() => dragData}
            className="flex-1"
        >
            {row}
        </DraggableItem>
    );
}
