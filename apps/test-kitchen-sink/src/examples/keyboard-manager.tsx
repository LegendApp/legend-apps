import { ownRegistration } from "@legend-apps/runtime-utils";
import { addKeyboardListener, KeyCodes, KeyText } from "@legendapp/spark/shortcuts/keyboard";
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

    const removeDown = ownRegistration(addKeyboardListener("down", (event) => {
      const handled = event.keyCode === KeyCodes.KEY_ESCAPE;
      setStatus(`Down: ${describeKey(event.keyCode)} modifiers=${event.modifiers}${handled ? " handled" : ""}`);
      return handled;
    }));
    const removeUp = ownRegistration(addKeyboardListener("up", (event) => {
      setStatus(`Up: ${describeKey(event.keyCode)} modifiers=${event.modifiers}`);
    }));

    return () => {
      void removeDown.remove().catch(console.error);
      void removeUp.remove().catch(console.error);
    };
  }, [enabled]);

  return (
    <ExamplePanel title="Keyboard Manager">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton onPress={() => setEnabled(true)}>Enable Monitoring</ExampleButton>
      <ExampleButton
        onPress={() => {
          setEnabled(false);
          setStatus("Monitoring stopped.");
        }}
      >
        Stop Monitoring
      </ExampleButton>
    </ExamplePanel>
  );
}
