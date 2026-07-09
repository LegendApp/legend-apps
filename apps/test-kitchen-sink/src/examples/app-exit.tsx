import { addAppExitListener, isAppExitSupported } from "@legend-apps/app-exit";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExamplePanel, styles } from "./shared";

export function AppExitExample() {
  const [lastEvent, setLastEvent] = useState("No exit event received.");

  useEffect(() => {
    const subscription = addAppExitListener((event) => {
      setLastEvent(`Exit event: ${event.reason}`);
    });
    return () => subscription.remove();
  }, []);

  return (
    <ExamplePanel title="App Exit">
      <Text style={styles.bodyText}>Supported: {isAppExitSupported() ? "Yes" : "No"}</Text>
      <Text style={styles.bodyText}>{lastEvent}</Text>
    </ExamplePanel>
  );
}
