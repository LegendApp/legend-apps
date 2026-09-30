import { registerGlobalShortcut } from "@legendapp/spark/global-shortcuts";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function GlobalHotkeyExample() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("Register Command+Shift+Space to test.");
  const cleanup = useRef(Promise.resolve());
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let owned: ReturnType<typeof ownRegistration> | undefined;
    const setup = cleanup.current.then(async () => {
      if (!active) return;
      owned = ownRegistration(registerGlobalShortcut("Cmd+Shift+Space", () => {
        if (active) setStatus(`Hotkey pressed at ${new Date().toLocaleTimeString()}`);
      }));
      await owned.ready;
      if (active) setStatus("Registered Command+Shift+Space");
    });
    void setup.catch(error => { if (active) { setStatus(String(error)); setEnabled(false); } });
    return () => {
      active = false;
      cleanup.current = setup.catch(() => {}).then(() => owned?.remove()).then(() => {});
      void cleanup.current.catch(console.error);
    };
  }, [enabled]);
  return <ExamplePanel title="Global Hotkey">
    <Text style={styles.bodyText}>{status}</Text>
    <ExampleButton disabled={enabled} onPress={() => { setStatus("Registering hotkey…"); setEnabled(true); }}>Register Hotkey</ExampleButton>
    <ExampleButton disabled={!enabled} onPress={() => { setEnabled(false); setStatus("Unregistered hotkey"); }}>Unregister Hotkey</ExampleButton>
  </ExamplePanel>;
}
