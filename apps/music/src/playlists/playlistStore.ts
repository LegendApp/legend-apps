import { createPlaylistId } from "../domain/musicIds";
import type { MusicId, MusicLibrary, MusicPlaylist } from "../domain/musicModel";
import { getMusicLibrarySnapshot, saveMusicLibrary } from "../library/libraryStore";

function getPlaylist(library: MusicLibrary, playlistId: MusicId) {
  return library.playlistsById[playlistId];
}

function isEditable(playlist: MusicPlaylist) {
  return playlist.source === "manual";
}

function uniqueTrackIds(trackIds: readonly MusicId[]) {
  const seen = new Set<MusicId>();
  const nextTrackIds: MusicId[] = [];

  for (const trackId of trackIds) {
    if (!seen.has(trackId)) {
      seen.add(trackId);
      nextTrackIds.push(trackId);
    }
  }

  return nextTrackIds;
}

function withPlaylist(library: MusicLibrary, playlist: MusicPlaylist): MusicLibrary {
  return {
    ...library,
    playlistsById: {
      ...library.playlistsById,
      [playlist.id]: playlist,
    },
    updatedAt: Date.now(),
  };
}

export async function createPlaylist(name: string, trackIds: readonly MusicId[] = []) {
  const now = Date.now();
  const trimmedName = name.trim() || "New Playlist";
  const playlist: MusicPlaylist = {
    createdAt: now,
    id: createPlaylistId(trimmedName, now),
    name: trimmedName,
    source: "manual",
    trackIds: uniqueTrackIds(trackIds),
    updatedAt: now,
  };

  await saveMusicLibrary(withPlaylist(getMusicLibrarySnapshot(), playlist));
  return playlist;
}

export async function renamePlaylist(playlistId: MusicId, name: string) {
  const library = getMusicLibrarySnapshot();
  const playlist = getPlaylist(library, playlistId);
  const trimmedName = name.trim();

  if (!playlist || !trimmedName || !isEditable(playlist)) {
    return playlist;
  }

  const nextPlaylist: MusicPlaylist = {
    ...playlist,
    name: trimmedName,
    updatedAt: Date.now(),
  };
  await saveMusicLibrary(withPlaylist(library, nextPlaylist));
  return nextPlaylist;
}

export async function deletePlaylist(playlistId: MusicId) {
  const library = getMusicLibrarySnapshot();
  const playlist = getPlaylist(library, playlistId);

  if (!playlist || !isEditable(playlist)) {
    return library;
  }

  const playlistsById = { ...library.playlistsById };
  delete playlistsById[playlistId];
  return saveMusicLibrary({
    ...library,
    playlistsById,
    updatedAt: Date.now(),
  });
}

export async function addTracksToPlaylist(playlistId: MusicId, trackIds: readonly MusicId[]) {
  const library = getMusicLibrarySnapshot();
  const playlist = getPlaylist(library, playlistId);

  if (!playlist || !isEditable(playlist)) {
    return playlist;
  }

  const validTrackIds = trackIds.filter((trackId) => Boolean(library.tracksById[trackId]));
  const nextPlaylist: MusicPlaylist = {
    ...playlist,
    trackIds: uniqueTrackIds([...playlist.trackIds, ...validTrackIds]),
    updatedAt: Date.now(),
  };
  await saveMusicLibrary(withPlaylist(library, nextPlaylist));
  return nextPlaylist;
}

export async function removeTrackFromPlaylist(playlistId: MusicId, trackId: MusicId) {
  const library = getMusicLibrarySnapshot();
  const playlist = getPlaylist(library, playlistId);

  if (!playlist || !isEditable(playlist)) {
    return playlist;
  }

  const nextPlaylist: MusicPlaylist = {
    ...playlist,
    trackIds: playlist.trackIds.filter((id) => id !== trackId),
    updatedAt: Date.now(),
  };
  await saveMusicLibrary(withPlaylist(library, nextPlaylist));
  return nextPlaylist;
}

export function resolvePlaylistTracks(library: MusicLibrary, playlistId: MusicId) {
  const playlist = library.playlistsById[playlistId];
  if (!playlist) {
    return [];
  }

  return playlist.trackIds.map((trackId) => library.tracksById[trackId]).filter(Boolean);
}
