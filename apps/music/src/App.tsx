import { openFileDialog } from "@legend-desktop/file-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { MusicId, MusicLibrary, MusicPlaylist, MusicTrack, RepeatMode } from "./domain";
import { clearMusicLibrary, scanLibrary, useMusicLibrary } from "./library";
import { useMusicDesktopIntegrations } from "./native";
import {
  enqueueTrack,
  clearPlaybackQueue,
  pausePlayback,
  playTrackNext,
  playTrackNow,
  removeQueueItem,
  resumePlayback,
  seekPlayback,
  setPlaybackVolume,
  setRepeatMode,
  skipNext,
  skipPrevious,
  toggleShuffle,
  usePlayback,
} from "./playback";
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  removeTrackFromPlaylist,
} from "./playlists";
import { updateMusicSettings, useMusicSettings } from "./settings";

const repeatModes: RepeatMode[] = ["off", "all", "one"];
type LibraryView =
  | Readonly<{ type: "songs" }>
  | Readonly<{ type: "album"; id: MusicId }>
  | Readonly<{ type: "artist"; id: MusicId }>
  | Readonly<{ type: "playlist"; id: MusicId }>;

export function App() {
  const library = useMusicLibrary();
  const playback = usePlayback();
  const settings = useMusicSettings();
  const [message, setMessage] = useState("Choose one or more music folders to build your library.");
  const [query, setQuery] = useState("");
  const [playlistName, setPlaylistName] = useState("");
  const [queueVisible, setQueueVisible] = useState(true);
  const [selectedView, setSelectedView] = useState<LibraryView>({ type: "songs" });
  const autoScanStarted = useRef(false);
  const queuePreferenceApplied = useRef(false);
  const tracks = useMemo(
    () => library.trackIds.map((id) => library.tracksById[id]).filter((track): track is MusicTrack => Boolean(track)),
    [library],
  );
  const roots = Object.values(library.rootsById);
  const albums = Object.values(library.albumsById).sort((a, b) => a.title.localeCompare(b.title));
  const artists = Object.values(library.artistsById).sort((a, b) => a.name.localeCompare(b.name));
  const playlists = Object.values(library.playlistsById).sort((a, b) => a.name.localeCompare(b.name));
  const selectedTracks = useMemo(() => selectViewTracks(library, tracks, selectedView), [library, selectedView, tracks]);
  const filteredTracks = useMemo(() => filterTracks(selectedTracks, query), [selectedTracks, query]);
  const currentItem = playback.queue.find((item) => item.id === playback.currentItemId);
  const currentTrack = currentItem ? library.tracksById[currentItem.trackId] : undefined;
  const selectedPlaylist = selectedView.type === "playlist" ? library.playlistsById[selectedView.id] : undefined;
  const isScanning = library.scan.status === "scanning";
  const isPlaying = playback.status === "playing";
  const configuredRootPaths = settings.library.rootPaths.length > 0 ? settings.library.rootPaths : roots.map((root) => root.path);

  useEffect(() => {
    if (!settings.loaded || queuePreferenceApplied.current) {
      return;
    }

    queuePreferenceApplied.current = true;
    setQueueVisible(settings.general.showQueueOnLaunch);
  }, [settings.general.showQueueOnLaunch, settings.loaded]);

  useEffect(() => {
    if (
      !settings.loaded ||
      autoScanStarted.current ||
      !settings.library.autoScanOnStart ||
      settings.library.rootPaths.length === 0
    ) {
      return;
    }

    autoScanStarted.current = true;
    setMessage(`Scanning ${settings.library.rootPaths.length} saved folder${settings.library.rootPaths.length === 1 ? "" : "s"}...`);
    scanLibrary(settings.library.rootPaths)
      .then((result) => {
        setMessage(`Indexed ${result.tracksIndexed} tracks from ${result.result.totalRoots} saved folder(s).`);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, [settings.loaded, settings.library.autoScanOnStart, settings.library.rootPaths]);

  const chooseLibraryFolders = async () => {
    const paths = await openFileDialog({
      allowsMultipleSelection: true,
      canChooseDirectories: true,
      canChooseFiles: false,
    });

    if (!paths?.length) {
      setMessage("Folder selection canceled.");
      return;
    }

    setMessage(`Scanning ${paths.length} folder${paths.length === 1 ? "" : "s"}...`);

    try {
      await updateMusicSettings({ library: { rootPaths: paths } });
      const result = await scanLibrary(paths);
      setMessage(`Indexed ${result.tracksIndexed} tracks from ${result.result.totalRoots} folder(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const clearLibrary = async () => {
    await clearPlaybackQueue();
    await clearMusicLibrary();
    await updateMusicSettings({ library: { rootPaths: [] } });
    setMessage("Library cleared.");
  };

  const rescanLibrary = async () => {
    if (configuredRootPaths.length === 0) {
      setMessage("Add a library folder before rescanning.");
      return;
    }

    setMessage(`Rescanning ${configuredRootPaths.length} folder${configuredRootPaths.length === 1 ? "" : "s"}...`);

    try {
      const result = await scanLibrary(configuredRootPaths);
      setMessage(`Indexed ${result.tracksIndexed} tracks from ${result.result.totalRoots} folder(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const setQueuePreference = (visible: boolean) => {
    setQueueVisible(visible);
    void updateMusicSettings({ general: { showQueueOnLaunch: visible } });
  };

  useMusicDesktopIntegrations({
    canClearLibrary: tracks.length > 0,
    canRescanLibrary: configuredRootPaths.length > 0,
    isPlaying,
    onAddLibrary: () => void chooseLibraryFolders(),
    onClearLibrary: () => void clearLibrary(),
    onRescanLibrary: () => void rescanLibrary(),
    onStatus: setMessage,
    onToggleQueue: () => setQueuePreference(!queueVisible),
    queueVisible,
    repeatMode: playback.repeatMode,
    settings,
    shuffleEnabled: playback.shuffleEnabled,
  });

  const playTrack = (trackId: MusicId) => {
    void playTrackNow(trackId, filteredTracks.map((track) => track.id));
  };

  const cycleRepeatMode = () => {
    const index = repeatModes.indexOf(playback.repeatMode);
    setRepeatMode(repeatModes[(index + 1) % repeatModes.length]);
  };

  const createManualPlaylist = async () => {
    const playlist = await createPlaylist(playlistName, []);
    setPlaylistName("");
    setSelectedView({ type: "playlist", id: playlist.id });
    setMessage(`Created playlist "${playlist.name}".`);
  };

  const deleteSelectedPlaylist = async () => {
    if (!selectedPlaylist || selectedPlaylist.source !== "manual") {
      return;
    }

    await deletePlaylist(selectedPlaylist.id);
    setSelectedView({ type: "songs" });
    setMessage(`Deleted playlist "${selectedPlaylist.name}".`);
  };

  const toggleTrackInSelectedPlaylist = async (trackId: MusicId) => {
    if (!selectedPlaylist || selectedPlaylist.source !== "manual") {
      return;
    }

    if (selectedPlaylist.trackIds.includes(trackId)) {
      await removeTrackFromPlaylist(selectedPlaylist.id, trackId);
      setMessage("Removed track from playlist.");
    } else {
      await addTracksToPlaylist(selectedPlaylist.id, [trackId]);
      setMessage("Added track to playlist.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <Text style={styles.appTitle}>Legend Music</Text>
        <View style={styles.stats}>
          <Text style={styles.sidebarText}>{tracks.length} tracks</Text>
          <Text style={styles.sidebarText}>{albums.length} albums</Text>
          <Text style={styles.sidebarText}>{artists.length} artists</Text>
          <Text style={styles.sidebarText}>{playlists.length} playlists</Text>
          <Text style={styles.sidebarText}>{playback.queue.length} queued</Text>
        </View>
        <View style={styles.buttonGroup}>
          <Pressable disabled={isScanning} onPress={() => void chooseLibraryFolders()} style={[styles.button, isScanning && styles.disabledButton]}>
            <Text style={styles.buttonText}>{isScanning ? "Scanning..." : "Add Library"}</Text>
          </Pressable>
          <Pressable disabled={isScanning || tracks.length === 0} onPress={() => void clearLibrary()} style={[styles.secondaryButton, (isScanning || tracks.length === 0) && styles.disabledSecondaryButton]}>
            <Text style={styles.secondaryButtonText}>Clear</Text>
          </Pressable>
        </View>
        <Pressable disabled={isScanning || configuredRootPaths.length === 0} onPress={() => void rescanLibrary()} style={[styles.secondaryButton, (isScanning || configuredRootPaths.length === 0) && styles.disabledSecondaryButton]}>
          <Text style={styles.secondaryButtonText}>Rescan Library</Text>
        </Pressable>
        <Text style={styles.statusText}>{message}</Text>
        {playback.error ? <Text style={styles.errorText}>{playback.error}</Text> : null}
        <View style={styles.sidebarSection}>
          <Text style={styles.sectionTitle}>Library</Text>
          <SidebarNavButton active={selectedView.type === "songs"} label="Songs" onPress={() => setSelectedView({ type: "songs" })} />
          {artists.slice(0, 8).map((artist) => (
            <SidebarNavButton
              active={selectedView.type === "artist" && selectedView.id === artist.id}
              key={artist.id}
              label={artist.name}
              onPress={() => setSelectedView({ type: "artist", id: artist.id })}
              value={`${artist.trackIds.length}`}
            />
          ))}
          {albums.slice(0, 8).map((album) => (
            <SidebarNavButton
              active={selectedView.type === "album" && selectedView.id === album.id}
              key={album.id}
              label={album.title}
              onPress={() => setSelectedView({ type: "album", id: album.id })}
              value={`${album.trackIds.length}`}
            />
          ))}
        </View>
        <View style={styles.sidebarSection}>
          <Text style={styles.sectionTitle}>Playlists</Text>
          <View style={styles.playlistCreateRow}>
            <TextInput
              onChangeText={setPlaylistName}
              placeholder="New playlist"
              placeholderTextColor="#8f8f88"
              style={styles.playlistInput}
              value={playlistName}
            />
            <Pressable onPress={() => void createManualPlaylist()} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>Add</Text>
            </Pressable>
          </View>
          {playlists.length === 0 ? (
            <Text style={styles.rootText}>No playlists yet.</Text>
          ) : (
            playlists.map((playlist) => (
              <SidebarNavButton
                active={selectedView.type === "playlist" && selectedView.id === playlist.id}
                key={playlist.id}
                label={playlist.name}
                onPress={() => setSelectedView({ type: "playlist", id: playlist.id })}
                value={playlist.source === "manual" ? `${playlist.trackIds.length}` : playlist.source.toUpperCase()}
              />
            ))
          )}
          {selectedPlaylist?.source === "manual" ? (
            <Pressable onPress={() => void deleteSelectedPlaylist()} style={styles.dangerButton}>
              <Text style={styles.dangerButtonText}>Delete Selected Playlist</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sidebarSection}>
          <Text style={styles.sectionTitle}>Roots</Text>
          {configuredRootPaths.length === 0 ? (
            <Text style={styles.rootText}>No folders added.</Text>
          ) : (
            configuredRootPaths.map((path) => (
              <Text key={path} numberOfLines={2} style={styles.rootText}>
                {path}
              </Text>
            ))
          )}
        </View>
        <View style={styles.sidebarSection}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <SettingsToggle
            label="Auto scan on start"
            onPress={() => void updateMusicSettings({ library: { autoScanOnStart: !settings.library.autoScanOnStart } })}
            value={settings.library.autoScanOnStart}
          />
          <SettingsToggle
            label="Show queue on launch"
            onPress={() => setQueuePreference(!settings.general.showQueueOnLaunch)}
            value={settings.general.showQueueOnLaunch}
          />
          <SettingsToggle
            label="Global hotkey"
            onPress={() => void updateMusicSettings({ general: { globalHotkeyEnabled: !settings.general.globalHotkeyEnabled } })}
            value={settings.general.globalHotkeyEnabled}
          />
          <SettingsToggle
            label="Auto update checks"
            onPress={() => void updateMusicSettings({ general: { autoCheckForUpdates: !settings.general.autoCheckForUpdates } })}
            value={settings.general.autoCheckForUpdates}
          />
        </View>
      </View>
      <View style={styles.main}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Library</Text>
            <Text style={styles.subtitle}>
              {library.scan.status === "scanning"
                ? `${library.scan.tracksScanned} scanned, ${library.scan.completedRoots}/${library.scan.totalRoots} folders`
                : `${getViewTitle(library, selectedView)} / ${filteredTracks.length} shown`}
            </Text>
          </View>
          <TextInput
            onChangeText={setQuery}
            placeholder="Search songs, artists, albums"
            placeholderTextColor="#8f8f88"
            style={styles.searchInput}
            value={query}
          />
        </View>
        <View style={styles.content}>
          <ScrollView contentContainerStyle={styles.trackList}>
            {filteredTracks.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>{tracks.length === 0 ? "No music indexed" : "No matching tracks"}</Text>
                <Text style={styles.emptyText}>
                  {tracks.length === 0 ? "Add a folder to scan audio metadata and persist the library." : "Adjust the search query."}
                </Text>
              </View>
            ) : (
              filteredTracks.slice(0, 500).map((track) => (
                <TrackRow
                  isCurrent={currentItem?.trackId === track.id}
                  key={track.id}
                  onEnqueue={() => enqueueTrack(track.id)}
                  onPlaylistAction={selectedPlaylist?.source === "manual" ? () => void toggleTrackInSelectedPlaylist(track.id) : undefined}
                  onPlay={() => playTrack(track.id)}
                  onPlayNext={() => playTrackNext(track.id)}
                  playlistActionLabel={
                    selectedPlaylist?.source === "manual"
                      ? selectedPlaylist.trackIds.includes(track.id) ? "Remove" : "Add"
                      : undefined
                  }
                  track={track}
                />
              ))
            )}
          </ScrollView>
          {queueVisible ? (
            <View style={styles.queuePanel}>
              <View style={styles.queueHeader}>
                <Text style={styles.queueTitle}>Queue</Text>
                <Pressable onPress={() => setQueuePreference(false)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Hide</Text>
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.queueList}>
                {playback.queue.length === 0 ? (
                  <Text style={styles.queueEmpty}>Queue is empty.</Text>
                ) : (
                  playback.queue.map((item, index) => {
                    const track = library.tracksById[item.trackId];
                    return (
                      <View key={item.id} style={[styles.queueRow, item.id === playback.currentItemId && styles.currentQueueRow]}>
                        <Text style={styles.queueIndex}>{index + 1}</Text>
                        <View style={styles.queueInfo}>
                          <Text numberOfLines={1} style={styles.queueTrackTitle}>
                            {track?.metadata.title ?? "Missing track"}
                          </Text>
                          <Text numberOfLines={1} style={styles.trackMeta}>
                            {track?.metadata.artist || "Unknown Artist"}
                          </Text>
                        </View>
                        <Pressable onPress={() => removeQueueItem(item.id)} style={styles.iconButton}>
                          <Text style={styles.iconButtonText}>x</Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : (
            <Pressable onPress={() => setQueuePreference(true)} style={styles.queueTab}>
              <Text style={styles.queueTabText}>Queue {playback.queue.length}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.player}>
          <View style={styles.nowPlaying}>
            <View style={styles.nowPlayingArtwork}>
              <Text style={styles.trackArtworkText}>{(currentTrack?.metadata.title ?? "L").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.nowPlayingText}>
              <Text numberOfLines={1} style={styles.nowPlayingTitle}>
                {currentTrack?.metadata.title ?? "Nothing playing"}
              </Text>
              <Text numberOfLines={1} style={styles.trackMeta}>
                {currentTrack?.metadata.artist || "Choose a track"}
              </Text>
            </View>
          </View>
          <View style={styles.transport}>
            <View style={styles.transportButtons}>
              <Pressable onPress={() => void skipPrevious()} style={styles.controlButton}>
                <Text style={styles.controlButtonText}>Prev</Text>
              </Pressable>
              <Pressable onPress={() => void (isPlaying ? pausePlayback() : resumePlayback())} style={styles.primaryControlButton}>
                <Text style={styles.primaryControlButtonText}>{isPlaying ? "Pause" : "Play"}</Text>
              </Pressable>
              <Pressable onPress={() => void skipNext()} style={styles.controlButton}>
                <Text style={styles.controlButtonText}>Next</Text>
              </Pressable>
              <Pressable onPress={() => toggleShuffle()} style={[styles.controlButton, playback.shuffleEnabled && styles.activeControlButton]}>
                <Text style={styles.controlButtonText}>Shuffle</Text>
              </Pressable>
              <Pressable onPress={cycleRepeatMode} style={[styles.controlButton, playback.repeatMode !== "off" && styles.activeControlButton]}>
                <Text style={styles.controlButtonText}>Repeat {playback.repeatMode}</Text>
              </Pressable>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{formatDuration(playback.positionSeconds)}</Text>
              <Pressable
                disabled={playback.durationSeconds <= 0}
                onPress={() => void seekPlayback(Math.max(0, playback.positionSeconds - 15))}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>-15</Text>
              </Pressable>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPercent(playback.positionSeconds, playback.durationSeconds)}%` }]} />
              </View>
              <Pressable
                disabled={playback.durationSeconds <= 0}
                onPress={() => void seekPlayback(Math.min(playback.durationSeconds, playback.positionSeconds + 15))}
                style={styles.smallButton}
              >
                <Text style={styles.smallButtonText}>+15</Text>
              </Pressable>
              <Text style={styles.timeText}>{formatDuration(playback.durationSeconds)}</Text>
            </View>
          </View>
          <View style={styles.volumeControls}>
            <Text style={styles.timeText}>Vol {Math.round(playback.volume * 100)}</Text>
            <Pressable onPress={() => void setPlaybackVolume(playback.volume - 0.1)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>-</Text>
            </Pressable>
            <Pressable onPress={() => void setPlaybackVolume(playback.volume + 0.1)} style={styles.smallButton}>
              <Text style={styles.smallButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default App;

function TrackRow(props: {
  isCurrent: boolean;
  onEnqueue: () => void;
  onPlaylistAction?: () => void;
  onPlay: () => void;
  onPlayNext: () => void;
  playlistActionLabel?: string;
  track: MusicTrack;
}) {
  const { isCurrent, onEnqueue, onPlay, onPlayNext, onPlaylistAction, playlistActionLabel, track } = props;

  return (
    <View style={[styles.trackRow, isCurrent && styles.currentTrackRow]}>
      <Pressable onPress={onPlay} style={styles.trackArtwork}>
        <Text style={styles.trackArtworkText}>{track.metadata.title.slice(0, 1).toUpperCase()}</Text>
      </Pressable>
      <Pressable onPress={onPlay} style={styles.trackInfo}>
        <Text numberOfLines={1} style={styles.trackTitle}>
          {track.metadata.title}
        </Text>
        <Text numberOfLines={1} style={styles.trackMeta}>
          {track.metadata.artist || "Unknown Artist"} {track.metadata.album ? `- ${track.metadata.album}` : ""}
        </Text>
      </Pressable>
      <Text style={styles.duration}>{formatDuration(track.metadata.durationSeconds)}</Text>
      <Pressable onPress={onPlayNext} style={styles.rowAction}>
        <Text style={styles.rowActionText}>Next</Text>
      </Pressable>
      <Pressable onPress={onEnqueue} style={styles.rowAction}>
        <Text style={styles.rowActionText}>Queue</Text>
      </Pressable>
      {onPlaylistAction && playlistActionLabel ? (
        <Pressable onPress={onPlaylistAction} style={styles.rowAction}>
          <Text style={styles.rowActionText}>{playlistActionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SidebarNavButton(props: {
  active: boolean;
  label: string;
  onPress: () => void;
  value?: string;
}) {
  const { active, label, onPress, value } = props;
  return (
    <Pressable onPress={onPress} style={[styles.sidebarNavButton, active && styles.activeSidebarNavButton]}>
      <Text numberOfLines={1} style={[styles.sidebarNavText, active && styles.activeSidebarNavText]}>
        {label}
      </Text>
      {value ? <Text style={styles.sidebarNavValue}>{value}</Text> : null}
    </Pressable>
  );
}

function SettingsToggle(props: {
  label: string;
  onPress: () => void;
  value: boolean;
}) {
  const { label, onPress, value } = props;

  return (
    <Pressable onPress={onPress} style={styles.settingsToggle}>
      <Text style={styles.settingsToggleLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackEnabled]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbEnabled]} />
      </View>
    </Pressable>
  );
}

function filterTracks(tracks: readonly MusicTrack[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return tracks;
  }

  return tracks.filter((track) => {
    const haystack = [
      track.metadata.title,
      track.metadata.artist,
      track.metadata.album,
      track.source.fileName,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

function selectViewTracks(library: MusicLibrary, tracks: readonly MusicTrack[], selectedView: LibraryView): MusicTrack[] {
  if (selectedView.type === "songs") {
    return [...tracks];
  }

  if (selectedView.type === "artist") {
    const artist = library.artistsById[selectedView.id];
    return artist?.trackIds.map((trackId) => library.tracksById[trackId]).filter((track): track is MusicTrack => Boolean(track)) ?? [];
  }

  if (selectedView.type === "album") {
    const album = library.albumsById[selectedView.id];
    return album?.trackIds.map((trackId) => library.tracksById[trackId]).filter((track): track is MusicTrack => Boolean(track)) ?? [];
  }

  const playlist = library.playlistsById[selectedView.id];
  return playlist?.trackIds.map((trackId) => library.tracksById[trackId]).filter((track): track is MusicTrack => Boolean(track)) ?? [];
}

function getViewTitle(library: MusicLibrary, selectedView: LibraryView) {
  if (selectedView.type === "songs") {
    return "Songs";
  }
  if (selectedView.type === "artist") {
    return library.artistsById[selectedView.id]?.name ?? "Artist";
  }
  if (selectedView.type === "album") {
    return library.albumsById[selectedView.id]?.title ?? "Album";
  }
  return library.playlistsById[selectedView.id]?.name ?? "Playlist";
}

function formatDuration(durationSeconds?: number) {
  if (!durationSeconds) {
    return "--:--";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function progressPercent(positionSeconds: number, durationSeconds: number) {
  if (!durationSeconds || durationSeconds <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (positionSeconds / durationSeconds) * 100));
}

const styles = StyleSheet.create({
  activeControlButton: {
    backgroundColor: "#dbe9d7",
    borderColor: "#8bae82",
  },
  activeSidebarNavButton: {
    backgroundColor: "#e4ede0",
  },
  activeSidebarNavText: {
    color: "#1e341f",
    fontWeight: "700",
  },
  appTitle: {
    color: "#171717",
    fontSize: 24,
    fontWeight: "700",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  container: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
  controlButton: {
    alignItems: "center",
    borderColor: "#c8c8c2",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: 12,
  },
  controlButtonText: {
    color: "#252522",
    fontSize: 12,
    fontWeight: "700",
  },
  currentQueueRow: {
    backgroundColor: "#eef5eb",
  },
  currentTrackRow: {
    backgroundColor: "#f0f6ed",
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledSecondaryButton: {
    opacity: 0.45,
  },
  dangerButton: {
    alignItems: "center",
    borderColor: "#d3b3ad",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 8,
  },
  dangerButtonText: {
    color: "#8c3a2d",
    fontSize: 12,
    fontWeight: "700",
  },
  duration: {
    color: "#77776f",
    fontSize: 12,
    width: 52,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
  },
  emptyText: {
    color: "#6f6f68",
    fontSize: 14,
    marginTop: 8,
  },
  emptyTitle: {
    color: "#222222",
    fontSize: 18,
    fontWeight: "700",
  },
  errorText: {
    color: "#a13a2b",
    fontSize: 13,
    lineHeight: 18,
  },
  header: {
    alignItems: "center",
    borderBottomColor: "#e2e2de",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 20,
    justifyContent: "space-between",
    paddingHorizontal: 28,
    paddingVertical: 18,
  },
  iconButton: {
    alignItems: "center",
    borderColor: "#d4d4ce",
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  iconButtonText: {
    color: "#5f5f59",
    fontSize: 12,
    fontWeight: "700",
  },
  main: {
    backgroundColor: "#fbfbfa",
    flex: 1,
  },
  nowPlaying: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 180,
  },
  nowPlayingArtwork: {
    alignItems: "center",
    backgroundColor: "#dfe7dc",
    borderRadius: 4,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  nowPlayingText: {
    flex: 1,
    minWidth: 0,
  },
  nowPlayingTitle: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "700",
  },
  player: {
    alignItems: "center",
    borderTopColor: "#deded8",
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 18,
    minHeight: 92,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  playlistCreateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  playlistInput: {
    backgroundColor: "#ffffff",
    borderColor: "#d7d7d0",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    color: "#20201d",
    flex: 1,
    fontSize: 13,
    height: 30,
    paddingHorizontal: 8,
  },
  primaryControlButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 6,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 68,
    paddingHorizontal: 14,
  },
  primaryControlButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  progressFill: {
    backgroundColor: "#2f4f31",
    borderRadius: 999,
    height: 6,
  },
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  progressTrack: {
    backgroundColor: "#d7d7d0",
    borderRadius: 999,
    height: 6,
    overflow: "hidden",
    width: 260,
  },
  queueEmpty: {
    color: "#77776f",
    fontSize: 13,
    padding: 12,
  },
  queueHeader: {
    alignItems: "center",
    borderBottomColor: "#e2e2de",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  queueIndex: {
    color: "#77776f",
    fontSize: 12,
    width: 24,
  },
  queueInfo: {
    flex: 1,
    minWidth: 0,
  },
  queueList: {
    paddingVertical: 4,
  },
  queuePanel: {
    borderLeftColor: "#e2e2de",
    borderLeftWidth: StyleSheet.hairlineWidth,
    width: 300,
  },
  queueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  queueTab: {
    alignItems: "center",
    borderLeftColor: "#e2e2de",
    borderLeftWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    width: 40,
  },
  queueTabText: {
    color: "#55554f",
    fontSize: 12,
    fontWeight: "700",
    transform: [{ rotate: "90deg" }],
    width: 86,
  },
  queueTitle: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "700",
  },
  queueTrackTitle: {
    color: "#222222",
    fontSize: 13,
    fontWeight: "600",
  },
  rootText: {
    color: "#77776f",
    fontSize: 12,
    lineHeight: 16,
  },
  rowAction: {
    alignItems: "center",
    borderColor: "#d2d2cb",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 9,
  },
  rowActionText: {
    color: "#44443f",
    fontSize: 12,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderColor: "#d7d7d0",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    color: "#20201d",
    fontSize: 14,
    height: 36,
    paddingHorizontal: 12,
    width: 320,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#c8c8c2",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#2d2d2a",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#41413c",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  sidebar: {
    backgroundColor: "#f5f5f3",
    borderRightColor: "#d8d8d2",
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 24,
    width: 280,
  },
  sidebarSection: {
    gap: 8,
    marginTop: 8,
  },
  sidebarNavButton: {
    alignItems: "center",
    borderRadius: 5,
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 28,
    paddingHorizontal: 8,
  },
  sidebarNavText: {
    color: "#454540",
    flex: 1,
    fontSize: 13,
  },
  sidebarNavValue: {
    color: "#77776f",
    fontSize: 11,
  },
  sidebarText: {
    color: "#40403c",
    fontSize: 14,
  },
  settingsToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    minHeight: 28,
  },
  settingsToggleLabel: {
    color: "#454540",
    flex: 1,
    fontSize: 13,
  },
  smallButton: {
    alignItems: "center",
    borderColor: "#d0d0ca",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 26,
    minWidth: 34,
    paddingHorizontal: 8,
  },
  smallButtonText: {
    color: "#44443f",
    fontSize: 12,
    fontWeight: "700",
  },
  stats: {
    gap: 6,
  },
  statusText: {
    color: "#5f5f59",
    fontSize: 13,
    lineHeight: 18,
  },
  subtitle: {
    color: "#72726c",
    fontSize: 13,
    marginTop: 4,
    textTransform: "capitalize",
  },
  timeText: {
    color: "#686862",
    fontSize: 12,
    minWidth: 44,
  },
  title: {
    color: "#171717",
    fontSize: 22,
    fontWeight: "700",
  },
  toggleThumb: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 14,
    width: 14,
  },
  toggleThumbEnabled: {
    transform: [{ translateX: 16 }],
  },
  toggleTrack: {
    backgroundColor: "#b9b9b1",
    borderRadius: 999,
    justifyContent: "center",
    padding: 2,
    width: 34,
  },
  toggleTrackEnabled: {
    backgroundColor: "#2f4f31",
  },
  trackArtwork: {
    alignItems: "center",
    backgroundColor: "#dfe7dc",
    borderRadius: 4,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  trackArtworkText: {
    color: "#29402b",
    fontSize: 14,
    fontWeight: "700",
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackList: {
    padding: 16,
  },
  trackMeta: {
    color: "#77776f",
    fontSize: 12,
    marginTop: 3,
  },
  trackRow: {
    alignItems: "center",
    borderBottomColor: "#e7e7e1",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
  },
  trackTitle: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "600",
  },
  transport: {
    alignItems: "center",
    flex: 2,
    gap: 10,
  },
  transportButtons: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  volumeControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    minWidth: 140,
  },
});
