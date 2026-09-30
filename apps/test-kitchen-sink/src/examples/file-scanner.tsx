import { scanFiles } from "@legendapp/spark/files";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, formatFirstPaths, styles } from "./shared";
export function FileScannerExample() {
 const [status, setStatus] = useState("Scan /tmp for text-like files."), [latestBatch, setLatestBatch] = useState("No batch received."), current = useRef<AbortController | null>(null);
 useEffect(() => () => current.current?.abort(), []);
 const scan = async () => {
  current.current?.abort(); const controller = new AbortController(); current.current = controller;
  try { const result = await scanFiles(["/tmp"], { extensions: ["txt", "log", "json"], batchSize: 12, includeStats: true, signal: controller.signal,
   onBatch(event) { if (!controller.signal.aborted) { setLatestBatch(formatFirstPaths(event.files)); setStatus(`Batch: ${event.files.length} files`); } },
   onProgress(event) { if (!controller.signal.aborted) setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`); }
  }); if (!controller.signal.aborted) setStatus(`Result: ${result.totalFiles} files, ${result.errors.length} errors`); }
  catch (error) { if (!controller.signal.aborted) setStatus(String(error)); }
 };
 return <ExamplePanel title="File Scanner"><Text style={styles.bodyText}>{status}</Text><Text style={styles.resultText}>{latestBatch}</Text><ExampleButton onPress={() => { void scan(); }}>Scan /tmp</ExampleButton></ExamplePanel>;
}
