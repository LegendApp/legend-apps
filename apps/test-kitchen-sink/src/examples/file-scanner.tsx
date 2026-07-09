import { addFileScannerListener, scanFiles } from "@legend-apps/file-scanner";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, formatFirstPaths, styles } from "./shared";

export function FileScannerExample() {
  const [status, setStatus] = useState("Scan /tmp for text-like files.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addFileScannerListener("onFileScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.files));
      setStatus(`Batch: ${event.files.length} files from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addFileScannerListener("onFileScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addFileScannerListener("onFileScanComplete", (event) => {
      setStatus(`Complete: ${event.totalFiles} files across ${event.totalRoots} roots`);
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="File Scanner">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{latestBatch}</Text>
      <ExampleButton
        onPress={() => {
          setStatus("Scanning /tmp...");
          void scanFiles(["/tmp"], {
            allowedExtensions: ["txt", "log", "json"],
            batchSize: 12,
            includeStats: true,
          }).then((result) => {
            setStatus(`Result: ${result.totalFiles} files, ${result.errors?.length ?? 0} errors`);
          });
        }}
      >
        Scan /tmp
      </ExampleButton>
    </ExamplePanel>
  );
}
