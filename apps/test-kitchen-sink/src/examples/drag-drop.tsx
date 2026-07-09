import { DragDropView, TrackDragSource, type NativeDragTrack } from "@legend-apps/drag-drop";
import { useState } from "react";
import { Text, View } from "react-native";
import { ExamplePanel, styles } from "./shared";

const sampleTracks: NativeDragTrack[] = [
  {
    artist: "Kitchen Sink",
    duration: "3:14",
    fileName: "sample-a.mp3",
    id: "sample-a",
    title: "Sample Track A",
  },
  {
    artist: "Kitchen Sink",
    duration: "4:02",
    fileName: "sample-b.mp3",
    id: "sample-b",
    title: "Sample Track B",
  },
];

export function DragDropExample() {
  const [status, setStatus] = useState("Drop audio files/folders or drag the sample tracks into the target.");
  const [payload, setPayload] = useState("No payload yet.");

  return (
    <ExamplePanel title="Drag Drop">
      <TrackDragSource tracks={sampleTracks} onDragStart={() => setStatus("Started dragging sample tracks.")}>
        <View style={styles.dragSource}>
          <Text style={styles.sidebarRowTitle}>Sample Track Drag Source</Text>
          <Text style={styles.sidebarRowDetail}>Drag this block into the drop target.</Text>
        </View>
      </TrackDragSource>
      <DragDropView
        allowedFileTypes={["mp3", "m4a", "aac", "wav", "flac", "aif", "aiff", "caf"]}
        onDragEnter={(event) => {
          setStatus("File drag entered.");
          setPayload(JSON.stringify(event.nativeEvent, null, 2));
        }}
        onDragLeave={() => setStatus("Drag left.")}
        onDrop={(event) => {
          setStatus("Files dropped.");
          setPayload(JSON.stringify(event.nativeEvent, null, 2));
        }}
        onTrackDragEnter={(event) => {
          setStatus("Track drag entered.");
          setPayload(JSON.stringify(event.nativeEvent, null, 2));
        }}
        onTrackDragHover={(event) => setPayload(JSON.stringify(event.nativeEvent, null, 2))}
        onTrackDragLeave={() => setStatus("Track drag left.")}
        onTrackDrop={(event) => {
          setStatus("Tracks dropped.");
          setPayload(JSON.stringify(event.nativeEvent, null, 2));
        }}
        style={styles.dropTarget}
      >
        <Text style={styles.sidebarRowTitle}>Drop Target</Text>
        <Text style={styles.bodyText}>{status}</Text>
      </DragDropView>
      <Text style={styles.resultText}>{payload}</Text>
    </ExamplePanel>
  );
}
