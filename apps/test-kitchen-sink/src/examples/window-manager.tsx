import { addWindowListener, closeWindow, getWindow, openWindow, setWindowBounds, setWindowOptions, showWindow, useWindowId, type WindowBounds } from "@legendapp/spark/windows";
import { addAppListener } from "@legendapp/spark/app";
import { setWindowBlur } from "@legendapp/spark/windows/macos";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ExampleButton, styles } from "./shared";
const frameLabel = (frame: WindowBounds) => `${frame.displayId}: ${Math.round(frame.x)}, ${Math.round(frame.y)} ${Math.round(frame.width)}x${Math.round(frame.height)}`;
export function WindowManagerExample({ childIdentifier, childModuleName }: { childIdentifier: string; childModuleName: string }) {
 const id = useWindowId(), [status, setStatus] = useState("Open a child window to test the window API."), [bounds, setBounds] = useState<WindowBounds | null>(null);
 const run = (operation: () => Promise<unknown>, label: string) => { void operation().then(() => setStatus(label)).catch(error => setStatus(String(error))); };
 useEffect(() => {
  let active = true;
  const report = (error: unknown) => { if (active) setStatus(String(error)); };
  const registrations = [
   ownRegistration(addAppListener("windowClosed", event => { if (active) setStatus(`Closed: ${event.windowId}`); }), report),
   ownRegistration(addWindowListener(id, "focusChanged", event => { if (active) setStatus(`Focused: ${event.focused}`); }), report),
   ownRegistration(addWindowListener(id, "boundsChanged", event => { if (active) setBounds(event.bounds); }), report),
  ];
  void getWindow(id).then(window => { if (active) setBounds(window.bounds); }).catch(report);
  return () => { active = false; for (const registration of registrations) void registration.remove().catch(report); };
 }, [id]);
 return <View style={styles.windowManagerPanel}><Text style={styles.panelTitle}>Window Manager</Text><Text style={styles.bodyText}>{status}</Text><Text style={styles.bodyText}>Frame: {bounds ? frameLabel(bounds) : "Unknown"}</Text>
 <ScrollView contentContainerStyle={styles.windowManagerControls} style={styles.windowManagerScroll}>
  <ExampleButton onPress={() => run(() => openWindow({ id: childIdentifier, component: childModuleName, title: "Window Manager Child", props: { windowId: childIdentifier, title: "Window Manager Child", detail: "Opened from the kitchen sink." }, size: { width: 460, height: 300 }, minSize: { width: 320, height: 220 }, macos: { titleBar: { contentLayout: "fullSize", transparent: true, material: "glass" }, toolbar: { visible: true, style: "unified" } } }), "Opened child")}>Open Child Window</ExampleButton>
  <ExampleButton onPress={() => run(async () => { const window = await getWindow(childIdentifier); await setWindowBounds(childIdentifier, { ...window.bounds, width: 540, height: 360 }); await setWindowOptions(childIdentifier, { title: "Updated Child Window", minSize: { width: 360, height: 240 } }); }, "Updated child")}>Update Existing Window</ExampleButton>
  <ExampleButton onPress={() => run(() => setWindowOptions(childIdentifier, { title: "Renamed from JS" }), "Renamed child")}>Rename Child</ExampleButton>
  <ExampleButton onPress={() => run(() => setWindowBlur(childIdentifier, { radius: 8, durationMs: 250 }), "Blurred child")}>Blur Child</ExampleButton>
  <ExampleButton onPress={() => run(() => setWindowBlur(childIdentifier, { radius: 0, durationMs: 250 }), "Cleared blur")}>Clear Blur</ExampleButton>
  <ExampleButton onPress={() => { void closeWindow(childIdentifier).then(result => setStatus(result.closed ? "Closed child" : "Close vetoed")).catch(error => setStatus(String(error))); }}>Close Child</ExampleButton>
  <ExampleButton onPress={() => run(() => showWindow("main"), "Showing main")}>Show Main Window</ExampleButton>
  <ExampleButton onPress={() => run(async () => setBounds((await getWindow(id)).bounds), "Read frame")}>Read Frame</ExampleButton>
  <ExampleButton onPress={() => run(async () => { const window = await getWindow("main"); const next = { ...window.bounds, width: Math.max(760, window.bounds.width), height: Math.max(520, window.bounds.height) }; await setWindowBounds("main", next); setBounds(next); }, "Normalized main size")}>Normalize Main Size</ExampleButton>
 </ScrollView></View>;
}
