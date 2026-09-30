import { openFileDialog, saveFileDialog } from "@legendapp/spark/dialogs";
import { useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function FileDialogExample() {
  const [result, setResult] = useState("No dialog result yet.");

  return (
    <ExamplePanel title="File Dialog">
      <Text style={styles.bodyText}>{result}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({ multiple: true }).then((paths) => {
            setResult(!paths.canceled ? paths.paths.join("\n") : "Open canceled.");
          });
        }}
      >
        Open Files
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void saveFileDialog({ defaultName: "legend-apps.txt" }).then((path) => {
            setResult(path.canceled ? "Save canceled." : path.path);
          });
        }}
      >
        Save File
      </ExampleButton>
    </ExamplePanel>
  );
}
