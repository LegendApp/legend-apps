import { addKeyDownListener, addKeyUpListener, KeyCodes, KeyText, stopKeyboardMonitoring } from "@legend-apps/keyboard-manager";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

function describeKey(keyCode: number) {
  return KeyText[keyCode] ?? `Key ${keyCode}`;
}

export function KeyboardManagerExample() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Enable monitoring, then press keys while this window is focused.");

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const removeDown = addKeyDownListener((event) => {
      const handled = event.keyCode === KeyCodes.KEY_ESCAPE;
      setStatus(`Down: ${describeKey(event.keyCode)} modifiers=${event.modifiers}${handled ? " handled" : ""}`);
      return handled;
    });
    const removeUp = addKeyUpListener((event) => {
      setStatus(`Up: ${describeKey(event.keyCode)} modifiers=${event.modifiers}`);
    });

    return () => {
      removeDown();
      removeUp();
    };
  }, [enabled]);

  return (
    <ExamplePanel title="Keyboard Manager">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton onPress={() => setEnabled(true)}>Enable Monitoring</ExampleButton>
      <ExampleButton
        onPress={() => {
          setEnabled(false);
          void stopKeyboardMonitoring();
          setStatus("Monitoring stopped.");
        }}
      >
        Stop Monitoring
      </ExampleButton>
    </ExamplePanel>
  );
}
