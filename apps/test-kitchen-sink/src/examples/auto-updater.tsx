import { checkForUpdates, getUpdateStatus, startUpdates } from "@legendapp/spark/updates";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";
export function AutoUpdaterExample() {
 const [status, setStatus] = useState("Checking update availability…"), [available, setAvailable] = useState(false);
 useEffect(() => { let active = true; void getUpdateStatus().then(result => { if (active) { setAvailable(result.available); setStatus(result.available ? "Updates available" : `Unavailable: ${result.reason}`); } }).catch(error => { if (active) setStatus(String(error)); }); return () => { active = false; }; }, []);
 return <ExamplePanel title="Auto Updater"><Text style={styles.bodyText}>{status}</Text><ExampleButton disabled={!available} onPress={() => { void startUpdates().then(() => checkForUpdates({ mode: "background" })).then(() => setStatus("Background check started")).catch(error => setStatus(String(error))); }}>Check in Background</ExampleButton></ExamplePanel>;
}
