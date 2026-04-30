import { File } from "expo-file-system/next";
import { createPlaylistId } from "../domain/musicIds";
import { fileNameFromPath, titleFromFileName, normalizePath } from "../domain/musicIds";
import type { MusicId, MusicLibrary, MusicPlaylist } from "../domain/musicModel";
import { getMusicLibrarySnapshot, saveMusicLibrary } from "../library/libraryStore";
import { readM3UTrackPaths, writeM3UTrackPaths } from "../library/m3u";

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

function trackIdsFromPaths(library: MusicLibrary, paths: readonly string[]) {
  const trackIdsByPath = new Map<string, MusicId>();
  for (const track of Object.values(library.tracksById)) {
    trackIdsByPath.set(normalizePath(track.source.filePath).toLowerCase(), track.id);
  }

  return uniqueTrackIds(paths
    .map((path) => trackIdsByPath.get(normalizePath(path).toLowerCase()))
    .filter((trackId): trackId is MusicId => Boolean(trackId)));
}

export async function importPlaylistFromM3U(sourcePath: string) {
  const library = getMusicLibrarySnapshot();
  const paths = await readM3UTrackPaths(sourcePath);
  const name = titleFromFileName(fileNameFromPath(sourcePath));
  const playlist = await createPlaylist(name, trackIdsFromPaths(library, paths));
  return {
    matchedTracks: playlist.trackIds.length,
    playlist,
    totalTracks: paths.length,
  };
}

export async function exportPlaylistToM3U(playlistId: MusicId, destinationPath: string) {
  const library = getMusicLibrarySnapshot();
  const playlist = getPlaylist(library, playlistId);
  if (!playlist) {
    return false;
  }

  const trackPaths = playlist.trackIds
    .map((trackId) => library.tracksById[trackId]?.source.filePath)
    .filter((path): path is string => Boolean(path));

  const file = new File(destinationPath);
  file.write(writeM3UTrackPaths(trackPaths));
  return true;
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
