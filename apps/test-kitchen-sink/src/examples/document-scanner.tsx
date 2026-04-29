import { addDocumentScannerListener, scanDocuments } from "@legend-desktop/document-scanner";
import { openFileDialog } from "@legend-desktop/file-dialog";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, formatFirstPaths, styles } from "./shared";

export function DocumentScannerExample() {
  const [status, setStatus] = useState("Choose a folder to scan for markdown documents.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addDocumentScannerListener("onDocumentScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.documents));
      setStatus(`Batch: ${event.documents.length} documents from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addDocumentScannerListener("onDocumentScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addDocumentScannerListener("onDocumentScanComplete", (event) => {
      setStatus(`Complete: ${event.totalDocuments} documents across ${event.totalRoots} roots`);
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="Document Scanner">
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
            void scanDocuments(paths, {
              allowedExtensions: ["md", "mdx"],
              batchSize: 12,
              includeStats: true,
            }).then((result) => {
              setStatus(`Result: ${result.totalDocuments} documents, ${result.errors?.length ?? 0} errors`);
            });
          });
        }}
      >
        Choose Folder
      </ExampleButton>
    </ExamplePanel>
  );
}
