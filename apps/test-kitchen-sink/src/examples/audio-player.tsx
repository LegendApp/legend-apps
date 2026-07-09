import {
  addAudioPlayerListener,
  clearNowPlayingInfo,
  getCurrentAudioState,
  loadTrack,
  pause,
  play,
  seek,
  setVolume,
  stop,
  updateNowPlayingInfo,
} from "@legend-apps/audio-player";
import { openFileDialog } from "@legend-apps/file-dialog";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function AudioPlayerExample() {
  const [filePath, setFilePath] = useState("");
  const [status, setStatus] = useState("Choose an audio file to load.");
  const [state, setState] = useState("No state yet.");

  useEffect(() => {
    const subscriptions = [
      addAudioPlayerListener("onLoadSuccess", (event) => setStatus(`Loaded. Duration ${event.duration.toFixed(1)}s.`)),
      addAudioPlayerListener("onLoadError", (event) => setStatus(`Load error: ${event.error}`)),
      addAudioPlayerListener("onPlaybackStateChanged", (event) => setStatus(event.isPlaying ? "Playing." : "Paused.")),
      addAudioPlayerListener("onProgress", (event) => {
        setState(`Progress ${event.currentTime.toFixed(1)}s${event.duration ? ` / ${event.duration.toFixed(1)}s` : ""}`);
      }),
      addAudioPlayerListener("onCompletion", () => setStatus("Playback completed.")),
      addAudioPlayerListener("onRemoteCommand", (event) => setStatus(`Remote command: ${event.command}`)),
      addAudioPlayerListener("onOcclusionChanged", (event) => setState(`Window occluded: ${event.isOccluded}`)),
    ];
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
    };
  }, []);

  return (
    <ExamplePanel title="Audio Player">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{filePath || "No file selected."}</Text>
      <Text style={styles.resultText}>{state}</Text>
      <View style={styles.controlRow}>
        <ExampleButton
          onPress={() => {
            void openFileDialog({
              allowedFileTypes: ["mp3", "m4a", "aac", "wav", "flac", "aif", "aiff", "caf"],
              allowsMultipleSelection: false,
            }).then((paths) => {
              const path = paths?.[0];
              if (!path) {
                setStatus("File selection canceled.");
                return;
              }
              setFilePath(path);
              setStatus(`Loading ${path.split("/").pop() ?? path}...`);
              void loadTrack(path).then((result) => {
                setStatus(result.success ? "Track loaded." : (result.error ?? "Load failed."));
                updateNowPlayingInfo({ title: path.split("/").pop() ?? "Audio file", elapsedTime: 0 });
              });
            });
          }}
        >
          Choose File
        </ExampleButton>
        <ExampleButton onPress={() => void play().then((result) => setStatus(result.success ? "Playing." : (result.error ?? "Play failed.")))}>
          Play
        </ExampleButton>
        <ExampleButton onPress={() => void pause().then((result) => setStatus(result.success ? "Paused." : (result.error ?? "Pause failed.")))}>
          Pause
        </ExampleButton>
        <ExampleButton onPress={() => void stop().then((result) => setStatus(result.success ? "Stopped." : (result.error ?? "Stop failed.")))}>
          Stop
        </ExampleButton>
        <ExampleButton onPress={() => void seek(30).then((result) => setStatus(result.success ? "Seeked to 30s." : (result.error ?? "Seek failed.")))}>
          Seek 30s
        </ExampleButton>
        <ExampleButton onPress={() => void setVolume(0.5).then((result) => setStatus(result.success ? "Volume set to 50%." : (result.error ?? "Volume failed.")))}>
          Volume 50%
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            clearNowPlayingInfo();
            void getCurrentAudioState().then((current) => setState(JSON.stringify(current, null, 2)));
          }}
        >
          Read State
        </ExampleButton>
      </View>
    </ExamplePanel>
  );
}
