import { openFileDialog } from "@legend-apps/file-dialog";
import { readMediaTags } from "@legend-apps/media-tags";
import { useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function MediaTagsExample() {
  const [status, setStatus] = useState("Choose an audio file to read metadata.");
  const [tags, setTags] = useState("No tags read yet.");

  return (
    <ExamplePanel title="Media Tags">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{tags}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({
            allowedFileTypes: ["mp3", "m4a", "aac", "wav", "flac", "aif", "aiff", "caf"],
            allowsMultipleSelection: false,
          }).then((paths) => {
            const path = paths?.[0];
            if (!path) {
              setStatus("File selection canceled.");
              return;
            }
            setStatus(`Reading ${path}...`);
            void readMediaTags(path, {
              cacheDir: "/tmp/legend-apps-media-tags",
              includeArtwork: true,
            }).then((result) => {
              setStatus(`Read tags for ${path.split("/").pop() ?? path}`);
              setTags(JSON.stringify(result, null, 2));
            });
          });
        }}
      >
        Choose Audio File
      </ExampleButton>
    </ExamplePanel>
  );
}
