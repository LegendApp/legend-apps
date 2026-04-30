import type { NativeScannedPlaylist, NativeScannedTrack } from "@legend-desktop/media-library-scanner";
import { buildLibraryIndexes, sortTrackIds } from "../domain/libraryIndex";
import {
  createScannedPlaylistId,
  createRootId,
  createTrackId,
  displayNameFromPath,
  fileNameFromPath,
  normalizePath,
  titleFromFileName,
} from "../domain/musicIds";
import { createEmptyLibrary, MUSIC_LIBRARY_VERSION, type MusicId, type MusicLibrary, type MusicPlaylist, type MusicTrack } from "../domain/musicModel";

type RawLibrary = Partial<MusicLibrary>;
type ScannedPlaylist = NativeScannedPlaylist & Readonly<{
  trackPaths?: readonly string[];
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function joinRootRelativePath(rootPath: string, relativePath: string) {
  if (relativePath.startsWith("/")) {
    return normalizePath(relativePath);
  }

  return `${normalizePath(rootPath)}/${relativePath.replace(/^\/+/, "")}`;
}

export function parseLibrarySnapshot(json: string | null): MusicLibrary {
  if (!json) {
    return createEmptyLibrary();
  }

  try {
    const parsed = JSON.parse(json) as RawLibrary;
    return sanitizeLibrarySnapshot(parsed);
  } catch {
    return createEmptyLibrary();
  }
}

export function serializeLibrarySnapshot(library: MusicLibrary) {
  return JSON.stringify(library);
}

export function sanitizeLibrarySnapshot(input: RawLibrary): MusicLibrary {
  const now = Date.now();
  const empty = createEmptyLibrary(now);
  const rootsById = isRecord(input.rootsById) ? input.rootsById : {};
  const tracksById = isRecord(input.tracksById) ? input.tracksById : {};
  const playlistsById = isRecord(input.playlistsById) ? input.playlistsById : {};
  const sanitizedRoots: Record<MusicId, MusicLibrary["rootsById"][MusicId]> = {};
  const sanitizedTracks: Record<MusicId, MusicTrack> = {};
  const sanitizedPlaylists: Record<MusicId, MusicPlaylist> = {};

  for (const value of Object.values(rootsById)) {
    if (!isRecord(value)) {
      continue;
    }

    const path = stringValue(value.path);
    if (!path) {
      continue;
    }

    const rootPath = normalizePath(path);
    const id = stringValue(value.id) ?? createRootId(rootPath);
    sanitizedRoots[id] = {
      addedAt: numericValue(value.addedAt) ?? now,
      id,
      lastScannedAt: numericValue(value.lastScannedAt),
      path: rootPath,
      title: stringValue(value.title) ?? displayNameFromPath(rootPath),
    };
  }

  for (const value of Object.values(tracksById)) {
    if (!isRecord(value) || !isRecord(value.source) || !isRecord(value.metadata)) {
      continue;
    }

    const rootId = stringValue(value.source.rootId);
    const relativePath = stringValue(value.source.relativePath);
    const root = rootId ? sanitizedRoots[rootId] : undefined;
    if (!root || !relativePath) {
      continue;
    }

    const fileName = stringValue(value.source.fileName) ?? fileNameFromPath(relativePath);
    const id = stringValue(value.id) ?? createTrackId(root.id, relativePath);
    sanitizedTracks[id] = {
      addedAt: numericValue(value.addedAt) ?? now,
      id,
      metadata: {
        album: stringValue(value.metadata.album),
        albumArtist: stringValue(value.metadata.albumArtist),
        artist: stringValue(value.metadata.artist),
        artworkKey: stringValue(value.metadata.artworkKey),
        artworkUri: stringValue(value.metadata.artworkUri),
        discNumber: numericValue(value.metadata.discNumber),
        durationSeconds: numericValue(value.metadata.durationSeconds),
        genre: stringValue(value.metadata.genre),
        title: stringValue(value.metadata.title) ?? titleFromFileName(fileName),
        trackNumber: numericValue(value.metadata.trackNumber),
        year: numericValue(value.metadata.year),
      },
      source: {
        fileName,
        filePath: stringValue(value.source.filePath) ?? joinRootRelativePath(root.path, relativePath),
        relativePath,
        rootId: root.id,
        rootPath: root.path,
      },
      updatedAt: numericValue(value.updatedAt) ?? now,
    };
  }

  for (const value of Object.values(playlistsById)) {
    if (!isRecord(value)) {
      continue;
    }

    const id = stringValue(value.id);
    const name = stringValue(value.name);
    if (!id || !name) {
      continue;
    }

    sanitizedPlaylists[id] = {
      createdAt: numericValue(value.createdAt) ?? now,
      id,
      name,
      source: value.source === "m3u" || value.source === "smart" ? value.source : "manual",
      sourcePath: stringValue(value.sourcePath),
      trackIds: Array.isArray(value.trackIds) ? value.trackIds.filter((item): item is string => typeof item === "string") : [],
      updatedAt: numericValue(value.updatedAt) ?? now,
    };
  }

  const trackIds = sortTrackIds(sanitizedTracks, Object.keys(sanitizedTracks));
  const indexes = buildLibraryIndexes(trackIds.map((id) => sanitizedTracks[id]).filter((track): track is MusicTrack => Boolean(track)));

  return {
    ...empty,
    ...indexes,
    playlistsById: sanitizedPlaylists,
    rootsById: sanitizedRoots,
    scan: input.scan ?? empty.scan,
    trackIds,
    tracksById: sanitizedTracks,
    updatedAt: numericValue(input.updatedAt) ?? now,
    version: MUSIC_LIBRARY_VERSION,
  };
}

export function buildLibraryFromScan(
  rootPaths: readonly string[],
  scannedTracks: readonly NativeScannedTrack[],
  scannedPlaylists: readonly ScannedPlaylist[] = [],
  now = Date.now(),
): MusicLibrary {
  const roots = rootPaths.map((path) => {
    const normalized = normalizePath(path);
    return {
      addedAt: now,
      id: createRootId(normalized),
      lastScannedAt: now,
      path: normalized,
      title: displayNameFromPath(normalized),
    };
  });
  const rootsById = Object.fromEntries(roots.map((root) => [root.id, root])) as MusicLibrary["rootsById"];
  const tracksById: Record<MusicId, MusicTrack> = {};
  const playlistsById: Record<MusicId, MusicPlaylist> = {};
  const trackIdsByPath = new Map<string, MusicId>();

  for (const scanned of scannedTracks) {
    const root = roots[scanned.rootIndex];
    if (!root || scanned.skipped) {
      continue;
    }

    const relativePath = normalizePath(scanned.relativePath);
    const fileName = scanned.fileName || fileNameFromPath(relativePath);
    const id = createTrackId(root.id, relativePath);
    tracksById[id] = {
      addedAt: now,
      id,
      metadata: {
        album: scanned.album,
        artist: scanned.artist,
        artworkKey: scanned.artworkKey,
        artworkUri: scanned.artworkUri,
        durationSeconds: scanned.durationSeconds,
        title: scanned.title || titleFromFileName(fileName),
        trackNumber: scanned.trackNumber,
      },
      source: {
        fileName,
        filePath: joinRootRelativePath(root.path, relativePath),
        relativePath,
        rootId: root.id,
        rootPath: root.path,
      },
      updatedAt: now,
    };
    trackIdsByPath.set(normalizePath(tracksById[id].source.filePath).toLowerCase(), id);
  }

  for (const playlist of scannedPlaylists) {
    const root = roots[playlist.rootIndex];
    const sourcePath = playlist.absolutePath ?? (root ? joinRootRelativePath(root.path, playlist.relativePath) : undefined);
    if (!sourcePath) {
      continue;
    }

    const id = createScannedPlaylistId(sourcePath);
    playlistsById[id] = {
      createdAt: now,
      id,
      name: playlist.fileName || fileNameFromPath(sourcePath),
      source: "m3u",
      sourcePath,
      trackIds: uniqueTrackIds((playlist.trackPaths ?? [])
        .map((trackPath) => trackIdsByPath.get(normalizePath(trackPath).toLowerCase()))
        .filter((trackId): trackId is MusicId => Boolean(trackId))),
      updatedAt: now,
    };
  }

  const trackIds = sortTrackIds(tracksById, Object.keys(tracksById));
  const tracks = trackIds.map((id) => tracksById[id]).filter((track): track is MusicTrack => Boolean(track));
  const indexes = buildLibraryIndexes(tracks);

  return {
    albumsById: indexes.albumsById,
    artistsById: indexes.artistsById,
    playlistsById,
    rootsById,
    scan: {
      completedRoots: roots.length,
      lastCompletedAt: now,
      lastStartedAt: now,
      status: "complete",
      totalRoots: roots.length,
      tracksScanned: trackIds.length,
    },
    trackIds,
    tracksById,
    updatedAt: now,
    version: MUSIC_LIBRARY_VERSION,
  };
}

function uniqueTrackIds(trackIds: readonly MusicId[]) {
  const seen = new Set<MusicId>();
  const unique: MusicId[] = [];
  for (const trackId of trackIds) {
    if (!seen.has(trackId)) {
      seen.add(trackId);
      unique.push(trackId);
    }
  }
  return unique;
}
