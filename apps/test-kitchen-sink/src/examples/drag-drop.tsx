import { DragDropView } from "@legendapp/spark/drag-drop";
import { useState } from "react";
import { Text, View } from "react-native";
import { ExamplePanel, styles } from "./shared";
const sampleType = "application/x-legend-kitchen-sink";
const sampleTracks = [{ id: "sample-a", title: "Sample Track A", artist: "Kitchen Sink" }, { id: "sample-b", title: "Sample Track B", artist: "Kitchen Sink" }];
export function DragDropExample() {
 const [status, setStatus] = useState("Drop files/folders or drag the sample data into the target."), [payload, setPayload] = useState("No payload yet.");
 return <ExamplePanel title="Drag Drop">
  <DragDropView source={{ data: { [sampleType]: JSON.stringify(sampleTracks) }, text: "Sample tracks" }} onDragEnd={event => setStatus(event.accepted ? "Drag accepted" : "Drag canceled")}><View style={styles.dragSource}><Text style={styles.sidebarRowTitle}>Sample Data Drag Source</Text><Text style={styles.sidebarRowDetail}>Drag this block into the drop target.</Text></View></DragDropView>
  <DragDropView acceptedTypes={["files", "urls", "text", sampleType]} onDragEnter={event => { setStatus("Drag entered"); setPayload(JSON.stringify(event, null, 2)); }} onDragOver={event => setStatus(`Drag at ${event.x}, ${event.y}`)} onDragLeave={() => setStatus("Drag left")} onDrop={event => { setStatus("Dropped"); setPayload(JSON.stringify(event, null, 2)); }} style={styles.dropTarget}><Text style={styles.sidebarRowTitle}>Drop Target</Text><Text style={styles.bodyText}>{status}</Text></DragDropView>
  <Text style={styles.resultText}>{payload}</Text>
 </ExamplePanel>;
}
