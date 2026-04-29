import {
  addDirectoryChangeListener,
  isWatchingDirectory,
  setWatchedDirectories,
} from "@legend-desktop/file-system-watcher";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function FileSystemWatcherExample() {
  const directory = "/tmp";
  const [status, setStatus] = useState(`Not watching ${directory}.`);

  useEffect(() => {
    const subscription = addDirectoryChangeListener((event) => {
      setStatus(`${event.type}: ${event.filePath}`);
    });
    return () => {
      subscription.remove();
      setWatchedDirectories([]);
    };
  }, []);

  return (
    <ExamplePanel title="File System Watcher">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          setWatchedDirectories([directory]);
          setStatus(`Watching ${directory}.`);
        }}
      >
        Watch /tmp
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void isWatchingDirectory(directory).then((value) => {
            setStatus(`${directory} watched: ${value ? "Yes" : "No"}`);
          });
        }}
      >
        Check Watch
      </ExampleButton>
    </ExamplePanel>
  );
}
