import { closeWindow, openWindow, WindowStyleMask } from "@legend-desktop/window-manager";
import { AppRegistry, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { MusicTrack } from "../domain";
import { useMusicLibrary } from "../library";
import { usePlayback } from "../playback";
import { getGlobalHotkeyLabel, getNextGlobalHotkey, updateMusicSettings, useMusicSettings } from "../settings";

const settingsModuleName = "LegendMusicSettingsWindow";
const libraryModuleName = "LegendMusicLibraryWindow";
const overlayModuleName = "LegendMusicNowPlayingOverlay";

export const settingsWindowId = "legend-music-settings";
export const libraryWindowId = "legend-music-library";
export const overlayWindowId = "legend-music-now-playing-overlay";

AppRegistry.registerComponent(settingsModuleName, () => MusicSettingsWindow);
AppRegistry.registerComponent(libraryModuleName, () => MusicLibraryWindow);
AppRegistry.registerComponent(overlayModuleName, () => NowPlayingOverlayWindow);

export function openMusicSettingsWindow() {
  return openWindow({
    identifier: settingsWindowId,
    moduleName: settingsModuleName,
    title: "Music Settings",
    windowStyle: {
      height: 520,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Miniaturizable,
        WindowStyleMask.Resizable,
      ],
      minHeight: 420,
      minWidth: 420,
      width: 520,
    },
  });
}

export function openMusicLibraryWindow() {
  return openWindow({
    identifier: libraryWindowId,
    moduleName: libraryModuleName,
    title: "Music Library",
    windowStyle: {
      height: 620,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Miniaturizable,
        WindowStyleMask.Resizable,
      ],
      minHeight: 420,
      minWidth: 620,
      width: 780,
    },
  });
}

export function openNowPlayingOverlay() {
  return openWindow({
    hasShadow: true,
    identifier: overlayWindowId,
    level: "floating",
    moduleName: overlayModuleName,
    title: "Now Playing",
    transparentBackground: true,
    windowStyle: {
      height: 120,
      mask: [
        WindowStyleMask.Borderless,
        WindowStyleMask.NonactivatingPanel,
      ],
      width: 360,
    },
  });
}

export function closeNowPlayingOverlay() {
  return closeWindow(overlayWindowId);
}

function MusicSettingsWindow() {
  const settings = useMusicSettings();
  const library = useMusicLibrary();

  return (
    <ScrollView contentContainerStyle={windowStyles.content} style={windowStyles.root}>
      <Text style={windowStyles.title}>Settings</Text>
      <WindowToggle
        label="Auto scan on start"
        onPress={() => void updateMusicSettings({ library: { autoScanOnStart: !settings.library.autoScanOnStart } })}
        value={settings.library.autoScanOnStart}
      />
      <WindowToggle
        label="Show queue on launch"
        onPress={() => void updateMusicSettings({ general: { showQueueOnLaunch: !settings.general.showQueueOnLaunch } })}
        value={settings.general.showQueueOnLaunch}
      />
      <WindowToggle
        label="Global hotkey"
        onPress={() => void updateMusicSettings({ general: { globalHotkeyEnabled: !settings.general.globalHotkeyEnabled } })}
        value={settings.general.globalHotkeyEnabled}
      />
      <View style={windowStyles.valueRow}>
        <Text numberOfLines={1} style={windowStyles.valueLabel}>
          {getGlobalHotkeyLabel(settings.general.globalHotkey)}
        </Text>
        <Pressable
          onPress={() => {
            const next = getNextGlobalHotkey(settings.general.globalHotkey);
            void updateMusicSettings({ general: { globalHotkey: { keyCode: next.keyCode, modifiers: next.modifiers } } });
          }}
          style={windowStyles.smallButton}
        >
          <Text style={windowStyles.smallButtonText}>Change</Text>
        </Pressable>
      </View>
      <WindowToggle
        label="Now playing overlay"
        onPress={() => void updateMusicSettings({ general: { nowPlayingOverlayEnabled: !settings.general.nowPlayingOverlayEnabled } })}
        value={settings.general.nowPlayingOverlayEnabled}
      />
      <WindowToggle
        label="Automatic update checks"
        onPress={() => void updateMusicSettings({ general: { autoCheckForUpdates: !settings.general.autoCheckForUpdates } })}
        value={settings.general.autoCheckForUpdates}
      />
      <Text style={windowStyles.sectionTitle}>Library Roots</Text>
      {settings.library.rootPaths.length === 0 ? (
        <Text style={windowStyles.muted}>No saved library folders.</Text>
      ) : (
        settings.library.rootPaths.map((path) => (
          <Text key={path} selectable style={windowStyles.pathText}>
            {path}
          </Text>
        ))
      )}
      <Text style={windowStyles.muted}>{library.trackIds.length} tracks indexed.</Text>
    </ScrollView>
  );
}

function MusicLibraryWindow() {
  const library = useMusicLibrary();
  const tracks = library.trackIds.map((trackId) => library.tracksById[trackId]).filter((track): track is MusicTrack => Boolean(track));
  const albums = Object.values(library.albumsById);
  const artists = Object.values(library.artistsById);
  const playlists = Object.values(library.playlistsById);

  return (
    <ScrollView contentContainerStyle={windowStyles.content} style={windowStyles.root}>
      <Text style={windowStyles.title}>Library</Text>
      <View style={windowStyles.statsRow}>
        <Stat label="Tracks" value={tracks.length} />
        <Stat label="Albums" value={albums.length} />
        <Stat label="Artists" value={artists.length} />
        <Stat label="Playlists" value={playlists.length} />
      </View>
      <Text style={windowStyles.sectionTitle}>Recently Indexed</Text>
      {tracks.slice(0, 80).map((track) => (
        <View key={track.id} style={windowStyles.trackRow}>
          <Artwork track={track} />
          <View style={windowStyles.trackText}>
            <Text numberOfLines={1} style={windowStyles.trackTitle}>{track.metadata.title}</Text>
            <Text numberOfLines={1} style={windowStyles.muted}>{track.metadata.artist || "Unknown Artist"} {track.metadata.album ? `- ${track.metadata.album}` : ""}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function NowPlayingOverlayWindow() {
  const playback = usePlayback();
  const library = useMusicLibrary();
  const currentItem = playback.queue.find((item) => item.id === playback.currentItemId);
  const track = currentItem ? library.tracksById[currentItem.trackId] : undefined;

  return (
    <View style={windowStyles.overlayRoot}>
      <Artwork track={track} large />
      <View style={windowStyles.overlayText}>
        <Text numberOfLines={1} style={windowStyles.overlayTitle}>{track?.metadata.title ?? "Nothing playing"}</Text>
        <Text numberOfLines={1} style={windowStyles.overlaySubtitle}>{track?.metadata.artist || "Legend Music"}</Text>
      </View>
    </View>
  );
}

function WindowToggle(props: {
  label: string;
  onPress: () => void;
  value: boolean;
}) {
  const { label, onPress, value } = props;
  return (
    <Pressable onPress={onPress} style={windowStyles.toggleRow}>
      <Text style={windowStyles.toggleLabel}>{label}</Text>
      <Text style={windowStyles.toggleValue}>{value ? "On" : "Off"}</Text>
    </Pressable>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <View style={windowStyles.stat}>
      <Text style={windowStyles.statValue}>{props.value}</Text>
      <Text style={windowStyles.muted}>{props.label}</Text>
    </View>
  );
}

function Artwork(props: { large?: boolean; track?: MusicTrack }) {
  const { large, track } = props;
  const sizeStyle = large ? windowStyles.artworkLarge : windowStyles.artwork;

  if (track?.metadata.artworkUri) {
    return <Image source={{ uri: track.metadata.artworkUri }} style={sizeStyle} />;
  }

  return (
    <View style={[sizeStyle, windowStyles.artworkFallback]}>
      <Text style={windowStyles.artworkFallbackText}>{(track?.metadata.title ?? "L").slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const windowStyles = StyleSheet.create({
  artwork: {
    borderRadius: 4,
    height: 38,
    width: 38,
  },
  artworkFallback: {
    alignItems: "center",
    backgroundColor: "#dfe7dc",
    justifyContent: "center",
  },
  artworkFallbackText: {
    color: "#29402b",
    fontSize: 14,
    fontWeight: "700",
  },
  artworkLarge: {
    borderRadius: 6,
    height: 64,
    width: 64,
  },
  content: {
    gap: 12,
    padding: 22,
  },
  muted: {
    color: "#686862",
    fontSize: 13,
  },
  overlayRoot: {
    alignItems: "center",
    backgroundColor: "rgba(250,250,248,0.94)",
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: "row",
    gap: 14,
    padding: 18,
  },
  overlaySubtitle: {
    color: "#686862",
    fontSize: 13,
    marginTop: 4,
  },
  overlayText: {
    flex: 1,
    minWidth: 0,
  },
  overlayTitle: {
    color: "#181816",
    fontSize: 16,
    fontWeight: "700",
  },
  pathText: {
    color: "#30302d",
    fontSize: 12,
    lineHeight: 17,
  },
  root: {
    backgroundColor: "#fbfbfa",
    flex: 1,
  },
  sectionTitle: {
    color: "#41413c",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textTransform: "uppercase",
  },
  smallButton: {
    alignItems: "center",
    borderColor: "#d0d0ca",
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 26,
    paddingHorizontal: 8,
  },
  smallButtonText: {
    color: "#44443f",
    fontSize: 12,
    fontWeight: "700",
  },
  stat: {
    backgroundColor: "#f0f0ed",
    borderRadius: 6,
    minWidth: 110,
    padding: 12,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statValue: {
    color: "#181816",
    fontSize: 22,
    fontWeight: "700",
  },
  title: {
    color: "#181816",
    fontSize: 22,
    fontWeight: "700",
  },
  toggleLabel: {
    color: "#30302d",
    fontSize: 14,
  },
  toggleRow: {
    alignItems: "center",
    borderBottomColor: "#e2e2de",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36,
  },
  toggleValue: {
    color: "#2f4f31",
    fontSize: 13,
    fontWeight: "700",
  },
  valueLabel: {
    color: "#686862",
    flex: 1,
    fontSize: 13,
  },
  valueRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minHeight: 28,
  },
  trackRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
  },
  trackText: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "600",
  },
});
