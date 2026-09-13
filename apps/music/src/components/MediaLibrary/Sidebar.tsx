import { batch, type Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useRef } from "react";
import {
    Alert,
    Platform,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import type { NativeMouseEvent } from "../../types/NativeMouseEvent";

import { Button } from "../Button";
import {
    type DraggedItem,
    DroppableZone,
    MEDIA_LIBRARY_DRAG_ZONE_ID,
    type MediaLibraryDragData,
} from "../dnd";
import { localAudioControls } from "../LocalAudioPlayer";
import type { TextInputSearchRef } from "../TextInputSearch";
import { showToast } from "../Toast";
import { useListItemStyles } from "../../hooks/useListItemStyles";
import { type ContextMenuItem, showContextMenu } from "@legend-apps/context-menu";
import { DragDropView } from "@legend-apps/drag-drop";
import { revealInFinder } from "@legend-apps/file-dialog";
import { SUPPORT_PLAYLISTS } from "../../systems/constants";
import { type LibraryView, libraryUI$, selectLibraryPlaylist, selectLibraryView } from "../../systems/LibraryState";
import { createLocalPlaylist, type LocalPlaylist, localMusicState$ } from "../../systems/LocalMusicState";
import {
    addTracksToPlaylist,
    deletePlaylist,
    duplicatePlaylistToCache,
    exportPlaylistToFile,
    renamePlaylist,
} from "../../systems/LocalPlaylists";
import { cn } from "@legend-apps/classnames";
import { perfCount } from "@legend-apps/runtime-utils";
import { getQueueAction } from "../../utils/queueActions";
import { buildTrackLookup, resolvePlaylistTracks } from "../../utils/trackResolution";
import { MediaLibrarySearchBar } from "./SearchBar";
import { appleMusicStatus$ } from "../../providers/appleMusic/provider";
import { providerLibrary$, selectProviderPlaylist } from "../../providers/registry";
import { spotifyStatus$ } from "../../providers/spotify/provider";
import type { ProviderPlaylist } from "../../providers/types";
import { state$ } from "../../systems/State";
import { ProviderBadge } from "../ProviderBadge";

const LIBRARY_VIEWS: { id: LibraryView; label: string; disabled?: boolean }[] = [
    { id: "artists", label: "Artists" },
    { id: "albums", label: "Albums" },
    { id: "songs", label: "Songs" },
    { id: "starred", label: "Starred", disabled: true },
];

export function MediaLibrarySidebar() {
    perfCount("MediaLibrary.Sidebar.render");
    const selectedView = useValue(libraryUI$.selectedView);
    const playlists = useValue(localMusicState$.playlists);
    const providerPlaylists = useValue(providerLibrary$.playlists);
    const selectedProviderPlaylist = useValue(providerLibrary$.selectedPlaylist);
    const spotifyStatus = useValue(spotifyStatus$);
    const appleMusicStatus = useValue(appleMusicStatus$);
    const listItemStyles = useListItemStyles();
    const searchInputRef = useRef<TextInputSearchRef | null>(null);
    const editing$ = useObservable<PlaylistEditingState>({
        tempPlaylistId: null,
        tempPlaylistName: "",
        editingPlaylistId: null,
        editingPlaylistName: "",
        activeNativeDropPlaylistId: null,
    });
    const setTempPlaylistId = editing$.tempPlaylistId.set;
    const setTempPlaylistName = editing$.tempPlaylistName.set;
    const setEditingPlaylistId = editing$.editingPlaylistId.set;
    const setEditingPlaylistName = editing$.editingPlaylistName.set;
    const handleSelectView = useCallback((view: LibraryView) => {
        selectLibraryView(view);
    }, []);
    const handleSelectProviderPlaylist = useCallback(async (playlist: ProviderPlaylist) => {
        libraryUI$.selectedView.set("provider-playlist");
        libraryUI$.selectedPlaylistId.set(null);
        try {
            await selectProviderPlaylist(playlist);
        } catch (error) {
            showToast(error instanceof Error ? error.message : `Could not load ${playlist.name}.`, "error");
        }
    }, []);

    const handleAddPlaylist = useCallback(() => {
        console.log("handleAddPlaylist");
        if (editing$.tempPlaylistId.peek()) {
            return;
        }

        const id = `pl-temp-${Date.now()}`;
        const defaultName = "New Playlist";
        localMusicState$.playlists.push({
            id,
            name: defaultName,
            filePath: "",
            trackPaths: [],
            trackCount: 0,
            source: "cache",
        });
        batch(() => {
            setTempPlaylistName(defaultName);
            setTempPlaylistId(id);
        });
        selectLibraryPlaylist(id);
    }, [editing$, setTempPlaylistName, setTempPlaylistId]);

    const finalizeTempPlaylist = useCallback(async () => {
        const tempPlaylistId = editing$.tempPlaylistId.peek();
        if (!tempPlaylistId) {
            return;
        }

        const name = editing$.tempPlaylistName.peek().trim();
        const currentPlaylists = localMusicState$.playlists.peek();
        localMusicState$.playlists.set(currentPlaylists.filter((pl) => pl.id !== tempPlaylistId));

        batch(() => {
            setTempPlaylistId(null);
            setTempPlaylistName("");
        });

        if (!name) {
            selectLibraryView("songs");
            return;
        }

        try {
            const playlist = await createLocalPlaylist(name);
            selectLibraryPlaylist(playlist.id);
        } catch (error) {
            console.error("Failed to create playlist:", error);
            selectLibraryView("songs");
        }
    }, [editing$, setTempPlaylistId, setTempPlaylistName]);

    const cancelRename = useCallback(() => {
        batch(() => {
            setEditingPlaylistId(null);
            setEditingPlaylistName("");
        });
    }, [setEditingPlaylistId, setEditingPlaylistName]);

    const finalizeRename = useCallback(async () => {
        const editingPlaylistId = editing$.editingPlaylistId.peek();
        if (!editingPlaylistId) {
            return;
        }

        const playlistId = editingPlaylistId;
        const nextName = editing$.editingPlaylistName.peek().trim();
        cancelRename();

        if (!nextName) {
            return;
        }

        try {
            const result = await renamePlaylist(playlistId, nextName);
            if (result) {
                showToast(`Renamed playlist to ${result.playlistName}`, "info");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to rename playlist";
            showToast(message, "error");
        }
    }, [cancelRename, editing$]);

    const handlePlaylistDoubleClick = useCallback((playlist: LocalPlaylist, event?: NativeMouseEvent) => {
        const allTracks = localMusicState$.tracks.peek();
        if (allTracks.length === 0) {
            return;
        }

        const { tracks: resolvedTracks, missingPaths } = resolvePlaylistTracks(
            {
                id: playlist.id,
                name: playlist.name,
                type: playlist.source,
                trackPaths: playlist.trackPaths,
            },
            allTracks,
            buildTrackLookup(allTracks),
        );

        if (missingPaths.length > 0) {
            console.warn(`Playlist ${playlist.name} is missing ${missingPaths.length} tracks from the library`);
        }

        if (resolvedTracks.length === 0) {
            showToast(`No tracks found in ${playlist.name}`, "info");
            return;
        }

        const action = getQueueAction({ event });
        switch (action) {
            case "play-now":
                localAudioControls.queue.insertNext(resolvedTracks, { playImmediately: true });
                break;
            case "play-next":
                localAudioControls.queue.insertNext(resolvedTracks);
                break;
            default:
                localAudioControls.queue.append(resolvedTracks);
                break;
        }

        const addedLabel = resolvedTracks.length === 1 ? "track" : "tracks";
        showToast(`Added ${resolvedTracks.length} ${addedLabel} from ${playlist.name} to queue`, "info");
    }, []);

    const handleAddTracks = useCallback(async (playlistId: string, trackPaths: string[]) => {
        try {
            const { addedPaths, playlist } = await addTracksToPlaylist(playlistId, trackPaths);
            const addedCount = addedPaths.length;
            if (addedCount > 0) {
                let msg: string;
                if (addedCount === 1) {
                    msg = "track";
                } else {
                    msg = "tracks";
                }
                showToast(`Added ${addedCount} ${msg} to ${playlist.name}`, "info");
            } else {
                showToast("No new tracks to add", "info");
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to add tracks to playlist";
            showToast(message, "error");
        }
    }, []);

    const handlePlaylistContextMenu = useCallback(
        async (playlist: LocalPlaylist, event: NativeMouseEvent, mode: "full" | "basic" = "full") => {
            const x = event.pageX ?? event.x ?? 0;
            const y = event.pageY ?? event.y ?? 0;

            const isEditable = playlist.source === "cache" && Boolean(playlist.filePath);
            const menuItems: ContextMenuItem[] = [];

            if (mode === "basic") {
                if (!isEditable) {
                    return;
                }

                menuItems.push({ id: "rename", title: "Rename" });
                menuItems.push({ id: "delete", title: "Delete" });
            } else if (isEditable) {
                menuItems.push({ id: "rename", title: "Rename" });
                menuItems.push({ id: "delete", title: "Delete" });
                menuItems.push({ id: "export", title: "Export .m3u" });
                menuItems.push({ id: "reveal", title: "Reveal in Finder" });
            } else {
                menuItems.push({ id: "import", title: "Import to Local Playlists" });
                menuItems.push({ id: "export", title: "Export .m3u" });
                menuItems.push({ id: "reveal", title: "Reveal in Finder" });
            }

            const selection = await showContextMenu(menuItems, { x, y });
            if (!selection) {
                return;
            }

            switch (selection) {
                case "rename":
                    batch(() => {
                        setEditingPlaylistName(playlist.name);
                        setEditingPlaylistId(playlist.id);
                    });
                    return;
                case "delete":
                    Alert.alert("Delete playlist", `Delete “${playlist.name}”?`, [
                        { text: "Cancel", style: "cancel" },
                        {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => {
                                void (async () => {
                                    try {
                                        await deletePlaylist(playlist.id);
                                        showToast(`Deleted ${playlist.name}`, "info");
                                    } catch (error) {
                                        const message =
                                            error instanceof Error ? error.message : "Failed to delete playlist";
                                        showToast(message, "error");
                                    }
                                })();
                            },
                        },
                    ]);
                    return;
                case "reveal": {
                    const didReveal = await revealInFinder(playlist.filePath);
                    if (!didReveal) {
                        showToast("Unable to reveal playlist", "error");
                    }
                    return;
                }
                case "export": {
                    try {
                        const exportedPath = await exportPlaylistToFile(playlist.id);
                        if (exportedPath) {
                            await revealInFinder(exportedPath);
                            showToast(`Exported ${playlist.name}`, "info");
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to export playlist";
                        showToast(message, "error");
                    }
                    return;
                }
                case "import": {
                    try {
                        const nextPlaylist = await duplicatePlaylistToCache(playlist.id);
                        selectLibraryPlaylist(nextPlaylist.id);
                        showToast(`Imported ${playlist.name}`, "info");
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to import playlist";
                        showToast(message, "error");
                    }
                    return;
                }
                default:
                    return;
            }
        },
        [setEditingPlaylistId, setEditingPlaylistName],
    );

    return (
        <View className="flex-1 min-h-0">
            <MediaLibrarySearchBar searchInputRef={searchInputRef} />
            <ScrollView
                className="flex-1"
                contentContainerClassName="px-2 pb-4"
                showsVerticalScrollIndicator={false}
            >
                <View className="pb-1">
                    <Text className="h-6 px-2 text-xs font-semibold leading-6 text-white/40 uppercase tracking-wider">
                        Library
                    </Text>
                    {LIBRARY_VIEWS.map((view) => {
                        const isSelected = selectedView === view.id;
                        return (
                            <Button
                                key={view.id}
                                disabled={view.disabled}
                                className={listItemStyles.getRowClassName({
                                    variant: "compact",
                                    isSelected,
                                    isInteractive: !view.disabled,
                                    className: "h-7 rounded-md px-2",
                                })}
                                onClick={() => handleSelectView(view.id)}
                            >
                                <Text
                                    className={cn(
                                        "text-sm truncate flex-1 pr-4",
                                        isSelected ? listItemStyles.text.primary : listItemStyles.text.secondary,
                                        view.disabled ? "opacity-40" : "",
                                    )}
                                    numberOfLines={1}
                                >
                                    {view.label}
                                </Text>
                            </Button>
                        );
                    })}
                </View>

                {SUPPORT_PLAYLISTS ? (
                    <View className="pt-2 pb-1">
                        <View className="h-7 flex-row items-center justify-between px-2">
                            <Text className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                                Playlists
                            </Text>
                            <AddPlaylistButton editing$={editing$} onAdd={handleAddPlaylist} />
                        </View>
                        {playlists.length === 0 ? (
                            <View className="px-2 py-1">
                                <Text className="text-sm text-white/40">No playlists yet</Text>
                            </View>
                        ) : (
                            playlists.map((playlist) => {
                                return <LibraryPlaylistRow key={playlist.id} playlist={playlist} editing$={editing$}
                                    finalizeTempPlaylist={finalizeTempPlaylist} finalizeRename={finalizeRename}
                                    handlePlaylistDoubleClick={handlePlaylistDoubleClick} handlePlaylistContextMenu={handlePlaylistContextMenu}
                                    handleAddTracks={handleAddTracks} />;
                            })
                        )}
                    </View>
                ) : null}

                {providerPlaylists.length > 0 ? (
                    <View className="pt-2 pb-1">
                        <Text className="h-7 px-2 text-xs font-semibold leading-7 text-white/40 uppercase tracking-wider">
                            Streaming Playlists
                        </Text>
                        {providerPlaylists.map((playlist) => {
                            const isSelected = selectedView === "provider-playlist"
                                && selectedProviderPlaylist?.provider === playlist.provider
                                && selectedProviderPlaylist.id === playlist.id;
                            return (
                                <Button
                                    key={`${playlist.provider}:${playlist.id}`}
                                    className={listItemStyles.getRowClassName({
                                        variant: "compact",
                                        isSelected,
                                        className: "h-7 rounded-md px-2 gap-2",
                                    })}
                                    onClick={() => void handleSelectProviderPlaylist(playlist)}
                                    onDoubleClick={() => {
                                        void selectProviderPlaylist(playlist)
                                            .then(() => {
                                                const tracks = providerLibrary$.selectedTracks.peek();
                                                if (tracks.length > 0) localAudioControls.queue.append(tracks);
                                            })
                                            .catch((error) => showToast(error instanceof Error ? error.message : `Could not load ${playlist.name}.`, "error"));
                                    }}
                                >
                                    <ProviderBadge provider={playlist.provider} compact />
                                    <Text className={cn("flex-1 text-sm", isSelected ? listItemStyles.text.primary : listItemStyles.text.secondary)} numberOfLines={1}>
                                        {playlist.name}
                                    </Text>
                                    <Text className={listItemStyles.getMetaClassName()}>{playlist.trackCount || ""}</Text>
                                </Button>
                            );
                        })}
                    </View>
                ) : null}

                <View className="pt-2 pb-2">
                    <Text className="h-6 px-2 text-xs font-semibold leading-6 text-white/40 uppercase tracking-wider">
                        Sources
                    </Text>
                    <View className="h-7 justify-center px-2">
                        <Text className="text-sm text-white/70">✓ Local Music</Text>
                    </View>
                    <Button
                        className="h-7 flex-row items-center gap-2 rounded-md px-2 hover:bg-white/10"
                        onClick={() => state$.assign({ showSettings: true, showSettingsPage: "spotify" })}
                    >
                        <ProviderBadge provider="spotify" compact />
                        <Text className="flex-1 text-sm text-white/70">{spotifyStatus.authenticated ? "✓ Spotify" : "Spotify"}</Text>
                        {!spotifyStatus.enabled || !spotifyStatus.authenticated ? <Text className="text-xs text-white/35">Set up</Text> : null}
                    </Button>
                    <Button
                        className="h-7 flex-row items-center gap-2 rounded-md px-2 hover:bg-white/10"
                        onClick={() => state$.assign({ showSettings: true, showSettingsPage: "apple-music" })}
                    >
                        <ProviderBadge provider="appleMusic" compact />
                        <Text className="flex-1 text-sm text-white/70">{appleMusicStatus.authenticated ? "✓ Apple Music" : "Apple Music"}</Text>
                        {!appleMusicStatus.enabled || !appleMusicStatus.authenticated ? <Text className="text-xs text-white/35">Set up</Text> : null}
                    </Button>
                </View>
            </ScrollView>
        </View>
    );
}

type PlaylistEditingState = {
    tempPlaylistId: string | null;
    tempPlaylistName: string;
    editingPlaylistId: string | null;
    editingPlaylistName: string;
    activeNativeDropPlaylistId: string | null;
};

function AddPlaylistButton({ editing$, onAdd }: { editing$: Observable<PlaylistEditingState>; onAdd: () => void }) {
    const disabled = useValue(() => editing$.tempPlaylistId.get() !== null);
    return <Button icon="plus" variant="icon" size="small" accessibilityLabel="Add playlist"
        disabled={disabled} onClick={onAdd} className="bg-transparent hover:bg-white/10" />;
}

function PlaylistNameInput({ value$, ...props }: React.ComponentProps<typeof TextInput> & { value$: Observable<string> }) {
    const value = useValue(value$);
    return <TextInput {...props} value={value} onChangeText={value$.set} />;
}

function LibraryPlaylistRow({ playlist, editing$, finalizeTempPlaylist, finalizeRename, handlePlaylistDoubleClick, handlePlaylistContextMenu, handleAddTracks }: {
    playlist: LocalPlaylist;
    editing$: Observable<PlaylistEditingState>;
    finalizeTempPlaylist: () => Promise<void>;
    finalizeRename: () => Promise<void>;
    handlePlaylistDoubleClick: (playlist: LocalPlaylist, event?: NativeMouseEvent) => void;
    handlePlaylistContextMenu: (playlist: LocalPlaylist, event: NativeMouseEvent, mode?: "full" | "basic") => Promise<void>;
    handleAddTracks: (id: string, paths: string[]) => Promise<void>;
}) {
    const listItemStyles = useListItemStyles();
    const setActiveNativeDropPlaylistId = editing$.activeNativeDropPlaylistId.set;
    const isSelected = useValue(() => libraryUI$.selectedView.get() === "playlist" && libraryUI$.selectedPlaylistId.get() === playlist.id);
    const isTemp = useValue(() => playlist.id === editing$.tempPlaylistId.get());
    const isEditing = useValue(() => playlist.id === editing$.editingPlaylistId.get());
    const isDroppable = playlist.source === "cache" && Boolean(playlist.filePath);
    const isNativeDropActive = useValue(() => Platform.OS === "macos" && isDroppable && editing$.activeNativeDropPlaylistId.get() === playlist.id);

    if (isTemp) {
        return (
            <View
                key={playlist.id}
                className={listItemStyles.getRowClassName({
                    variant: "compact",
                    isSelected: true,
                    isInteractive: false,
                    className: "h-7 rounded-md px-2",
                })}
            >
                <PlaylistNameInput
                    value$={editing$.tempPlaylistName}
                    onSubmitEditing={finalizeTempPlaylist}
                    onBlur={finalizeTempPlaylist}
                    autoFocus
                    selectTextOnFocus
                    placeholder="New Playlist"
                    className="flex-1 text-sm text-text-primary"
                />
            </View>
        );
    }

    if (isEditing) {
        return (
            <View
                key={playlist.id}
                className={listItemStyles.getRowClassName({
                    variant: "compact",
                    isSelected: true,
                    isInteractive: false,
                    className: "h-7 rounded-md px-2",
                })}
            >
                <PlaylistNameInput
                    value$={editing$.editingPlaylistName}
                    onSubmitEditing={finalizeRename}
                    onBlur={finalizeRename}
                    autoFocus
                    selectTextOnFocus
                    placeholder="Playlist name"
                    className="flex-1 text-sm text-text-primary"
                />
            </View>
        );
    }

    const renderRow = (className?: string) => (
        <Button
            className={cn(
                listItemStyles.getRowClassName({
                    variant: "compact",
                    isSelected,
                    className: "h-7 rounded-md px-2",
                }),
                className,
            )}
            onClick={() => selectLibraryPlaylist(playlist.id)}
            onDoubleClick={(event) => handlePlaylistDoubleClick(playlist, event)}
            onRightClick={(event) => handlePlaylistContextMenu(playlist, event)}
        >
            <View className="flex-1 flex-row items-center justify-between overflow-hidden">
                <Text
                    className={cn(
                        "text-sm truncate flex-1 pr-2",
                        isSelected
                            ? listItemStyles.text.primary
                            : listItemStyles.text.secondary,
                    )}
                    numberOfLines={1}
                >
                    {playlist.name}
                </Text>
                <Text className={listItemStyles.getMetaClassName()}>
                    {playlist.trackCount}
                </Text>
            </View>
        </Button>
    );

    if (Platform.OS === "macos") {
        return (
            <DragDropView
                key={playlist.id}
                className={cn(
                    "relative",
                    isNativeDropActive ? "bg-blue-500/15 border border-blue-400/50" : "",
                )}
                onTrackDragEnter={() => {
                    if (isDroppable) {
                        setActiveNativeDropPlaylistId(playlist.id);
                    }
                }}
                onTrackDragLeave={() => {
                    setActiveNativeDropPlaylistId((prev) =>
                        prev === playlist.id ? null : prev,
                    );
                }}
                onTrackDrop={(event) => {
                    setActiveNativeDropPlaylistId((prev) =>
                        prev === playlist.id ? null : prev,
                    );
                    const tracks = event.nativeEvent.tracks ?? [];
                    const trackPaths = tracks
                        .map((track) => track.filePath ?? track.id)
                        .filter((path): path is string => Boolean(path));
                    if (isDroppable && trackPaths.length > 0) {
                        void handleAddTracks(playlist.id, trackPaths);
                    }
                }}
            >
                {renderRow()}
            </DragDropView>
        );
    }

    if (!isDroppable) {
        return <View key={playlist.id}>{renderRow()}</View>;
    }

    return (
        <View key={playlist.id} className="relative">
            <DroppableZone
                id={`library-playlist-drop-${playlist.id}`}
                className="absolute inset-0"
                allowDrop={(item: DraggedItem) => {
                    if (item.sourceZoneId !== MEDIA_LIBRARY_DRAG_ZONE_ID) {
                        return false;
                    }

                    const data = item.data as MediaLibraryDragData;
                    return data?.type === "media-library-tracks" && data.tracks.length > 0;
                }}
                onDrop={(item: DraggedItem) => {
                    const data = item.data as MediaLibraryDragData;
                    if (data?.type !== "media-library-tracks") {
                        return;
                    }

                    const trackPaths = data.tracks
                        .map((track) => track.filePath)
                        .filter((path): path is string => Boolean(path));
                    if (trackPaths.length === 0) {
                        return;
                    }

                    void handleAddTracks(playlist.id, trackPaths);
                }}
            >
                {(isActive) =>
                    isActive ? (
                        <View className="absolute inset-0 rounded-md bg-blue-500/15 border border-blue-400/50" />
                    ) : null
                }
            </DroppableZone>
            {renderRow()}
        </View>
    );

}
