import {
  addFullscreenChangeListener,
  hideWindowControls,
  isWindowFullScreen,
  showWindowControls,
} from "@legend-apps/window-controls";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function WindowControlsExample() {
  const [status, setStatus] = useState("Fullscreen status unknown.");

  useEffect(() => {
    const subscription = addFullscreenChangeListener((event) => {
      setStatus(`Fullscreen: ${event.isFullscreen ? "Yes" : "No"}`);
    });
    void isWindowFullScreen().then((value) => {
      setStatus(`Fullscreen: ${value ? "Yes" : "No"}`);
    });
    return () => subscription.remove();
  }, []);

  return (
    <ExamplePanel title="Window Controls">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton onPress={hideWindowControls}>Hide Controls</ExampleButton>
      <ExampleButton onPress={showWindowControls}>Show Controls</ExampleButton>
      <ExampleButton
        onPress={() => {
          void isWindowFullScreen().then((value) => setStatus(`Fullscreen: ${value ? "Yes" : "No"}`));
        }}
      >
        Check Fullscreen
      </ExampleButton>
    </ExamplePanel>
  );
}
