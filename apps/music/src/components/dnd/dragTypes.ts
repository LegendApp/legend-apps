import type { LocalTrack } from "@/systems/LocalMusicState";

export type PlaylistDragData = {
    type: "playlist-track";
    queueEntryId: string;
};

export type MediaLibraryDragData = {
    type: "media-library-tracks";
    tracks: LocalTrack[];
};

export type LocalPlaylistDragData = {
    type: "local-playlist-track";
    playlistId: string;
    trackPath: string;
    sourceIndex: number;
};

export type DragData = PlaylistDragData | MediaLibraryDragData | LocalPlaylistDragData;

export const PLAYLIST_DRAG_ZONE_ID = "playlist-tracks";
export const MEDIA_LIBRARY_DRAG_ZONE_ID = "media-library-tracks";
export const LOCAL_PLAYLIST_DRAG_ZONE_ID = "local-playlist-tracks";
