import { addWindowListener, getWindow, setWindowOptions, useWindowId } from "@legendapp/spark/windows";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";
export function WindowControlsExample() {
 const id = useWindowId(), [status, setStatus] = useState("Fullscreen status unknown.");
 const report = (error: unknown) => setStatus(String(error));
 const refresh = () => getWindow(id).then(window => setStatus(`Fullscreen: ${window.fullscreen ? "Yes" : "No"}`)).catch(report);
 useEffect(() => {
  let active = true;
  const registration = ownRegistration(addWindowListener(id, "fullscreenChanged", event => { if (active) setStatus(`Fullscreen: ${event.fullscreen ? "Yes" : "No"}`); }), report);
  void registration.ready.then(async () => { const window = await getWindow(id); if (active) setStatus(`Fullscreen: ${window.fullscreen ? "Yes" : "No"}`); }).catch(report);
  return () => { active = false; void registration.remove().catch(report); };
 }, [id]);
 return <ExamplePanel title="Window Controls"><Text style={styles.bodyText}>{status}</Text>
  <ExampleButton onPress={() => { void setWindowOptions(id, { macos: { titleBar: { trafficLights: false } } }).catch(report); }}>Hide Controls</ExampleButton>
  <ExampleButton onPress={() => { void setWindowOptions(id, { macos: { titleBar: { trafficLights: true } } }).catch(report); }}>Show Controls</ExampleButton>
  <ExampleButton onPress={() => { void refresh(); }}>Check Fullscreen</ExampleButton>
 </ExamplePanel>;
}
