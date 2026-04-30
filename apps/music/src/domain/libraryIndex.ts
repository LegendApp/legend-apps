import { createAlbumId, createArtistId } from "./musicIds";
import type { MusicAlbum, MusicArtist, MusicId, MusicLibrary, MusicTrack } from "./musicModel";

function compareTracks(a: MusicTrack, b: MusicTrack): number {
  const albumCompare = (a.metadata.album || "").localeCompare(b.metadata.album || "");
  if (albumCompare !== 0) {
    return albumCompare;
  }

  const discCompare = (a.metadata.discNumber ?? 0) - (b.metadata.discNumber ?? 0);
  if (discCompare !== 0) {
    return discCompare;
  }

  const trackCompare = (a.metadata.trackNumber ?? 0) - (b.metadata.trackNumber ?? 0);
  if (trackCompare !== 0) {
    return trackCompare;
  }

  return a.metadata.title.localeCompare(b.metadata.title);
}

function pushTrackId(record: Map<MusicId, MusicId[]>, key: MusicId, trackId: MusicId) {
  const existing = record.get(key);
  if (existing) {
    existing.push(trackId);
  } else {
    record.set(key, [trackId]);
  }
}

export function sortTrackIds(tracksById: MusicLibrary["tracksById"], trackIds: readonly MusicId[]) {
  return [...trackIds].sort((a, b) => {
    const trackA = tracksById[a];
    const trackB = tracksById[b];

    if (!trackA || !trackB) {
      return a.localeCompare(b);
    }

    return compareTracks(trackA, trackB);
  });
}

export function buildLibraryIndexes(tracks: readonly MusicTrack[]) {
  const artists = new Map<MusicId, { name: string; trackIds: MusicId[] }>();
  const albums = new Map<
    MusicId,
    {
      artistName?: string;
      artworkKey?: string;
      artworkUri?: string;
      title: string;
      trackIds: MusicId[];
      year?: number;
    }
  >();
  const albumTrackIds = new Map<MusicId, MusicId[]>();
  const artistTrackIds = new Map<MusicId, MusicId[]>();

  for (const track of tracks) {
    const artistName = track.metadata.artist || "Unknown Artist";
    const artistId = createArtistId(artistName);
    const albumTitle = track.metadata.album || "Unknown Album";
    const albumId = createAlbumId(albumTitle, track.metadata.albumArtist || artistName);

    if (!artists.has(artistId)) {
      artists.set(artistId, { name: artistName, trackIds: [] });
    }

    if (!albums.has(albumId)) {
      albums.set(albumId, {
        artistName: track.metadata.albumArtist || artistName,
        artworkKey: track.metadata.artworkKey,
        artworkUri: track.metadata.artworkUri,
        title: albumTitle,
        trackIds: [],
        year: track.metadata.year,
      });
    }

    pushTrackId(artistTrackIds, artistId, track.id);
    pushTrackId(albumTrackIds, albumId, track.id);
  }

  const tracksById = Object.fromEntries(tracks.map((track) => [track.id, track])) as MusicLibrary["tracksById"];
  const artistsById: Record<MusicId, MusicArtist> = {};
  const albumsById: Record<MusicId, MusicAlbum> = {};

  for (const [id, artist] of artists) {
    artistsById[id] = {
      id,
      name: artist.name,
      trackIds: sortTrackIds(tracksById, artistTrackIds.get(id) ?? []),
    };
  }

  for (const [id, album] of albums) {
    albumsById[id] = {
      ...album,
      id,
      trackIds: sortTrackIds(tracksById, albumTrackIds.get(id) ?? []),
    };
  }

  return { albumsById, artistsById };
}

export function selectTracks(library: MusicLibrary): MusicTrack[] {
  return library.trackIds.map((id) => library.tracksById[id]).filter((track): track is MusicTrack => Boolean(track));
}
