import { AutoUpdater } from "@legend-apps/auto-updater";
import { useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function AutoUpdaterExample() {
  const [status, setStatus] = useState(`Available: ${AutoUpdater.isAvailable() ? "Yes" : "No"}`);

  return (
    <ExamplePanel title="Auto Updater">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          void AutoUpdater.checkForUpdatesInBackground().then((result) => {
            setStatus(`Background check started: ${result ? "Yes" : "No"}`);
          });
        }}
      >
        Check in Background
      </ExampleButton>
    </ExamplePanel>
  );
}
