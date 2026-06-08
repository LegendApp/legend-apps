import { LegendList } from "@legendapp/list/react-native";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useCallback, useMemo, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";

import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
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
import { generatePlaylistExtension } from "@/systems/ai/playlistGeneration";
import { libraryUI$ } from "@/systems/LibraryState";
import { localMusicState$, saveLocalPlaylistTracks } from "@/systems/LocalMusicState";
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
    const [isAIPromptOpen, setIsAIPromptOpen] = useState(false);
    const [aiPrompt, setAIPrompt] = useState("");
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const trimmedAIPrompt = aiPrompt.trim();

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
    const canGenerateAIPlaylist = Boolean(selectedPlaylist && isPlaylistEditable && !isGeneratingAI);

    const handleGenerateAIPlaylist = useCallback(
        async (userPrompt?: string) => {
            if (!selectedPlaylist || !isPlaylistEditable || isGeneratingAI) {
                return;
            }

            setIsGeneratingAI(true);
            try {
                const result = await generatePlaylistExtension({
                    libraryTracks,
                    playlist: selectedPlaylist,
                    userPrompt,
                });
                const { addedPaths, playlist } = await addTracksToPlaylist(
                    selectedPlaylist.id,
                    result.tracks.map((track) => track.filePath),
                );

                if (addedPaths.length === 0) {
                    showToast("No new tracks to add", "info");
                    return;
                }

                const unresolvedSuffix =
                    result.unresolvedCount > 0 ? ` (${result.unresolvedCount} unresolved)` : "";
                showToast(
                    `Added ${addedPaths.length} ${addedPaths.length === 1 ? "track" : "tracks"} to ${playlist.name}${unresolvedSuffix}`,
                    "info",
                    {
                        label: "Undo",
                        onPress: () => {
                            const latestPlaylist =
                                localMusicState$.playlists.peek().find((candidate) => candidate.id === playlist.id) ??
                                null;
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
                const message = error instanceof Error ? error.message : "Failed to generate playlist tracks";
                showToast(message, "error");
            } finally {
                setIsGeneratingAI(false);
            }
        },
        [isGeneratingAI, isPlaylistEditable, libraryTracks, selectedPlaylist],
    );

    const handleSubmitAIPrompt = useCallback(() => {
        if (!trimmedAIPrompt) {
            showToast("Enter a prompt first", "error");
            return;
        }

        setIsAIPromptOpen(false);
        setAIPrompt("");
        void handleGenerateAIPlaylist(trimmedAIPrompt);
    }, [handleGenerateAIPlaylist, trimmedAIPrompt]);

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
                <View className="px-3 py-2 flex-row items-center justify-end gap-2 border-t border-border-primary">
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={!canGenerateAIPlaylist}
                        className={!canGenerateAIPlaylist ? "opacity-50" : undefined}
                        onClick={() => void handleGenerateAIPlaylist()}
                    >
                        {isGeneratingAI ? "Generating..." : "Auto"}
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={!canGenerateAIPlaylist}
                        className={!canGenerateAIPlaylist ? "opacity-50" : undefined}
                        onClick={() => setIsAIPromptOpen(true)}
                    >
                        Prompt
                    </Button>
                </View>
            ) : null}
            {isAIPromptOpen ? (
                <View className="absolute inset-0 z-20 items-center justify-center bg-black/50">
                    <View className="w-[440px] rounded-lg border border-border-primary bg-background-secondary p-4 gap-3 shadow-lg">
                        <View className="gap-1">
                            <Text className="text-base font-semibold text-text-primary">Prompt</Text>
                            <Text className="text-xs text-text-secondary" numberOfLines={2}>
                                {selectedPlaylist?.name ?? "Playlist"}
                            </Text>
                        </View>
                        <TextInput
                            multiline
                            value={aiPrompt}
                            onChangeText={setAIPrompt}
                            placeholder="More upbeat, less acoustic, similar era..."
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            className="min-h-28 rounded-md border border-border-primary bg-black/20 px-3 py-2 text-sm text-text-primary"
                            textAlignVertical="top"
                        />
                        <View className="flex-row justify-end gap-2">
                            <Button
                                size="small"
                                variant="secondary"
                                onClick={() => {
                                    setIsAIPromptOpen(false);
                                    setAIPrompt("");
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                variant="accent"
                                disabled={!trimmedAIPrompt}
                                className={!trimmedAIPrompt ? "opacity-50" : undefined}
                                onClick={handleSubmitAIPrompt}
                            >
                                Generate
                            </Button>
                        </View>
                    </View>
                </View>
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
