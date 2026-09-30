import { beforeQuit, getAppAvailability } from "@legendapp/spark/app";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExamplePanel, styles } from "./shared";
export function AppExitExample() {
 const [lastEvent, setLastEvent] = useState("No quit request received.");
 useEffect(() => { const registration = ownRegistration(beforeQuit(() => { setLastEvent("Quit request accepted."); return true; })); return () => { void registration.remove().catch(console.error); }; }, []);
 return <ExamplePanel title="App Exit"><Text style={styles.bodyText}>Supported: {getAppAvailability().available ? "Yes" : "No"}</Text><Text style={styles.bodyText}>{lastEvent}</Text></ExamplePanel>;
}
