import { openFileDialog } from "@legend-desktop/file-dialog";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { clearMusicLibrary, scanLibrary, useMusicLibrary } from "./library";

export function App() {
  const library = useMusicLibrary();
  const [message, setMessage] = useState("Choose one or more music folders to build your library.");
  const tracks = useMemo(() => library.trackIds.map((id) => library.tracksById[id]).filter(Boolean), [library]);
  const roots = Object.values(library.rootsById);
  const albums = Object.values(library.albumsById);
  const artists = Object.values(library.artistsById);
  const isScanning = library.scan.status === "scanning";

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
      const result = await scanLibrary(paths);
      setMessage(`Indexed ${result.tracksIndexed} tracks from ${result.result.totalRoots} folder(s).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const clearLibrary = async () => {
    await clearMusicLibrary();
    setMessage("Library cleared.");
  };

  return (
    <View style={styles.container}>
      <View style={styles.sidebar}>
        <Text style={styles.appTitle}>Legend Music</Text>
        <Text style={styles.sidebarText}>{tracks.length} tracks</Text>
        <Text style={styles.sidebarText}>{albums.length} albums</Text>
        <Text style={styles.sidebarText}>{artists.length} artists</Text>
        <View style={styles.buttonGroup}>
          <Pressable disabled={isScanning} onPress={() => void chooseLibraryFolders()} style={styles.button}>
            <Text style={styles.buttonText}>{isScanning ? "Scanning..." : "Add Library"}</Text>
          </Pressable>
          <Pressable disabled={isScanning || tracks.length === 0} onPress={() => void clearLibrary()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Clear</Text>
          </Pressable>
        </View>
        <Text style={styles.statusText}>{message}</Text>
        {roots.map((root) => (
          <Text key={root.id} numberOfLines={2} style={styles.rootText}>
            {root.path}
          </Text>
        ))}
      </View>
      <View style={styles.main}>
        <View style={styles.header}>
          <Text style={styles.title}>Library</Text>
          <Text style={styles.subtitle}>
            {library.scan.status === "scanning"
              ? `${library.scan.tracksScanned} scanned, ${library.scan.completedRoots}/${library.scan.totalRoots} folders`
              : library.scan.status}
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.trackList}>
          {tracks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No music indexed</Text>
              <Text style={styles.emptyText}>Add a folder to scan audio metadata and persist the library.</Text>
            </View>
          ) : (
            tracks.slice(0, 250).map((track) => (
              <View key={track.id} style={styles.trackRow}>
                <View style={styles.trackArtwork}>
                  <Text style={styles.trackArtworkText}>{track.metadata.title.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.trackInfo}>
                  <Text numberOfLines={1} style={styles.trackTitle}>
                    {track.metadata.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.trackMeta}>
                    {track.metadata.artist || "Unknown Artist"} {track.metadata.album ? `- ${track.metadata.album}` : ""}
                  </Text>
                </View>
                <Text style={styles.duration}>{formatDuration(track.metadata.durationSeconds)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export default App;

function formatDuration(durationSeconds?: number) {
  if (!durationSeconds) {
    return "--:--";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  sidebar: {
    backgroundColor: "#f5f5f3",
    borderRightColor: "#d8d8d2",
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 12,
    padding: 24,
    width: 280,
  },
  appTitle: {
    color: "#171717",
    fontSize: 24,
    fontWeight: "700",
  },
  sidebarText: {
    color: "#40403c",
    fontSize: 14,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 6,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#c8c8c2",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#2d2d2a",
    fontSize: 13,
    fontWeight: "700",
  },
  statusText: {
    color: "#5f5f59",
    fontSize: 13,
    lineHeight: 18,
  },
  rootText: {
    color: "#77776f",
    fontSize: 12,
    lineHeight: 16,
  },
  main: {
    backgroundColor: "#fbfbfa",
    flex: 1,
  },
  header: {
    borderBottomColor: "#e2e2de",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 28,
    paddingVertical: 22,
  },
  title: {
    color: "#171717",
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: "#72726c",
    fontSize: 13,
    marginTop: 4,
    textTransform: "capitalize",
  },
  trackList: {
    padding: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
  },
  emptyTitle: {
    color: "#222222",
    fontSize: 18,
    fontWeight: "700",
  },
  emptyText: {
    color: "#6f6f68",
    fontSize: 14,
    marginTop: 8,
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
  trackTitle: {
    color: "#222222",
    fontSize: 14,
    fontWeight: "600",
  },
  trackMeta: {
    color: "#77776f",
    fontSize: 12,
    marginTop: 3,
  },
  duration: {
    color: "#77776f",
    fontSize: 12,
    width: 52,
  },
});
