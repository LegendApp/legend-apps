import { openFileDialog } from "@legend-desktop/file-dialog";
import { addMediaLibraryScannerListener, scanMediaLibrary } from "@legend-desktop/media-library-scanner";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, formatFirstPaths, styles } from "./shared";

export function MediaLibraryScannerExample() {
  const [status, setStatus] = useState("Choose a folder to scan for media files.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addMediaLibraryScannerListener("onMediaScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.tracks));
      setStatus(`Batch: ${event.tracks.length} tracks from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addMediaLibraryScannerListener("onMediaScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addMediaLibraryScannerListener("onMediaScanComplete", (event) => {
      setStatus(
        `Complete: ${event.totalTracks} tracks, ${event.playlists?.length ?? 0} playlists, ${event.errors?.length ?? 0} errors`,
      );
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="Media Library Scanner">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{latestBatch}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({
            canChooseDirectories: true,
            canChooseFiles: false,
          }).then((paths) => {
            if (!paths?.length) {
              setStatus("Directory selection canceled.");
              return;
            }
            setStatus(`Scanning ${paths[0]}...`);
            void scanMediaLibrary(paths, "/tmp/legend-desktop-media-tags", {
              batchSize: 8,
              includeArtwork: false,
            }).then((result) => {
              setStatus(
                `Result: ${result.totalTracks} tracks, ${result.playlists?.length ?? 0} playlists, ${result.errors?.length ?? 0} errors`,
              );
            });
          });
        }}
      >
        Choose Folder
      </ExampleButton>
    </ExamplePanel>
  );
}
