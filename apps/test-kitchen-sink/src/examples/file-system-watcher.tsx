import { watch } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function FileSystemWatcherExample() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Not watching /tmp.");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const owned = ownRegistration(watch("/tmp", path => {
      if (active) setStatus(`Changed: ${path}`);
    }, { recursive: true }));
    void owned.ready.then(() => { if (active) setStatus("Watching /tmp."); }, error => {
      if (active) { setStatus(String(error)); setEnabled(false); }
    });
    return () => { active = false; void owned.remove().catch(console.error); };
  }, [enabled]);
  return <ExamplePanel title="File System Watcher">
    <Text style={styles.bodyText}>{status}</Text>
    <ExampleButton disabled={enabled} onPress={() => setEnabled(true)}>Watch /tmp</ExampleButton>
    <ExampleButton onPress={() => setStatus(enabled ? "/tmp watch owned by this example" : "No active watch")}>Check Watch</ExampleButton>
    <ExampleButton disabled={!enabled} onPress={() => { setEnabled(false); setStatus("Stopped watching /tmp."); }}>Stop Watch</ExampleButton>
  </ExamplePanel>;
}
