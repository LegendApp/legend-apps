export const MUSIC_LIBRARY_VERSION = 1;

export type MusicId = string;

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "stopped" | "error";

export type RepeatMode = "off" | "all" | "one";

export type LibraryScanStatus = "idle" | "scanning" | "complete" | "error";

export type MusicLibraryRoot = Readonly<{
  id: MusicId;
  path: string;
  title: string;
  addedAt: number;
  lastScannedAt?: number;
}>;

export type MusicTrackSource = Readonly<{
  fileName: string;
  filePath: string;
  relativePath: string;
  rootId: MusicId;
  rootPath: string;
}>;

export type MusicTrackMetadata = Readonly<{
  album?: string;
  albumArtist?: string;
  artist?: string;
  artworkKey?: string;
  artworkUri?: string;
  discNumber?: number;
  durationSeconds?: number;
  genre?: string;
  title: string;
  trackNumber?: number;
  year?: number;
}>;

export type MusicTrack = Readonly<{
  addedAt: number;
  id: MusicId;
  metadata: MusicTrackMetadata;
  source: MusicTrackSource;
  updatedAt: number;
}>;

export type MusicArtist = Readonly<{
  id: MusicId;
  name: string;
  trackIds: readonly MusicId[];
}>;

export type MusicAlbum = Readonly<{
  artistName?: string;
  artworkKey?: string;
  artworkUri?: string;
  id: MusicId;
  title: string;
  trackIds: readonly MusicId[];
  year?: number;
}>;

export type MusicPlaylistSource = "manual" | "m3u" | "smart";

export type MusicPlaylist = Readonly<{
  createdAt: number;
  id: MusicId;
  name: string;
  source: MusicPlaylistSource;
  sourcePath?: string;
  trackIds: readonly MusicId[];
  updatedAt: number;
}>;

export type MusicQueueItem = Readonly<{
  id: MusicId;
  queuedAt: number;
  trackId: MusicId;
}>;

export type MusicPlaybackState = Readonly<{
  currentItemId?: MusicId;
  durationSeconds: number;
  error?: string;
  positionSeconds: number;
  queue: readonly MusicQueueItem[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  status: PlaybackStatus;
  volume: number;
}>;

export type MusicLibraryScanState = Readonly<{
  completedRoots: number;
  error?: string;
  lastCompletedAt?: number;
  lastStartedAt?: number;
  status: LibraryScanStatus;
  totalRoots: number;
  tracksScanned: number;
}>;

export type MusicLibrary = Readonly<{
  albumsById: Readonly<Record<MusicId, MusicAlbum>>;
  artistsById: Readonly<Record<MusicId, MusicArtist>>;
  playlistsById: Readonly<Record<MusicId, MusicPlaylist>>;
  rootsById: Readonly<Record<MusicId, MusicLibraryRoot>>;
  scan: MusicLibraryScanState;
  trackIds: readonly MusicId[];
  tracksById: Readonly<Record<MusicId, MusicTrack>>;
  updatedAt: number;
  version: number;
}>;

export function createEmptyPlaybackState(): MusicPlaybackState {
  return {
    durationSeconds: 0,
    positionSeconds: 0,
    queue: [],
    repeatMode: "off",
    shuffleEnabled: false,
    status: "idle",
    volume: 1,
  };
}

export function createEmptyLibrary(now = Date.now()): MusicLibrary {
  return {
    albumsById: {},
    artistsById: {},
    playlistsById: {},
    rootsById: {},
    scan: {
      completedRoots: 0,
      status: "idle",
      totalRoots: 0,
      tracksScanned: 0,
    },
    trackIds: [],
    tracksById: {},
    updatedAt: now,
    version: MUSIC_LIBRARY_VERSION,
  };
}
