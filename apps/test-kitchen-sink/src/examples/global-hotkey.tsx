import { addGlobalHotkeyListener, registerGlobalHotkey, unregisterGlobalHotkey } from "@legend-desktop/global-hotkey";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

const commandModifier = 1 << 20;
const shiftModifier = 1 << 17;

export function GlobalHotkeyExample() {
  const [status, setStatus] = useState("Register Command+Shift+Space to test.");

  useEffect(() => {
    const subscription = addGlobalHotkeyListener(() => {
      setStatus(`Hotkey pressed at ${new Date().toLocaleTimeString()}`);
    });
    return () => {
      subscription.remove();
      void unregisterGlobalHotkey();
    };
  }, []);

  return (
    <ExamplePanel title="Global Hotkey">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          void registerGlobalHotkey(49, commandModifier | shiftModifier).then((result) => {
            setStatus(result.success ? "Registered Command+Shift+Space." : (result.message ?? "Registration failed."));
          });
        }}
      >
        Register Hotkey
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void unregisterGlobalHotkey().then((result) => {
            setStatus(result.success ? "Unregistered hotkey." : (result.message ?? "Unregister failed."));
          });
        }}
      >
        Unregister Hotkey
      </ExampleButton>
    </ExamplePanel>
  );
}
