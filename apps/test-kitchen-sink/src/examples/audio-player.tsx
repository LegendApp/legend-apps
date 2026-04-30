import {
  addAudioPlayerListener,
  clearNowPlayingInfo,
  getCurrentState,
  loadTrack,
  pause,
  play,
  seek,
  stop,
  updateNowPlayingInfo,
} from "@legend-desktop/audio-player";
import { openFileDialog } from "@legend-desktop/file-dialog";
import { readMediaTags } from "@legend-desktop/media-tags";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

const audioFileTypes = ["mp3", "m4a", "aac", "wav", "flac", "aif", "aiff", "caf"];

function fileNameFromPath(path: string) {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayerExample() {
  const [filePath, setFilePath] = useState("");
  const [status, setStatus] = useState("Choose an audio file to load.");
  const [progress, setProgress] = useState("0:00 / 0:00");

  useEffect(() => {
    const subscriptions = [
      addAudioPlayerListener("onLoadSuccess", (event) => {
        setStatus(`Loaded. Duration ${formatSeconds(event.duration)}.`);
        setProgress(`0:00 / ${formatSeconds(event.duration)}`);
      }),
      addAudioPlayerListener("onLoadError", (event) => {
        setStatus(`Load failed: ${event.error}`);
      }),
      addAudioPlayerListener("onPlaybackStateChanged", (event) => {
        setStatus(event.isPlaying ? "Playing." : "Paused.");
      }),
      addAudioPlayerListener("onProgress", (event) => {
        setProgress(`${formatSeconds(event.currentTime)} / ${formatSeconds(event.duration)}`);
      }),
      addAudioPlayerListener("onCompletion", () => {
        setStatus("Playback completed.");
      }),
      addAudioPlayerListener("onRemoteCommand", (event) => {
        setStatus(`Remote command: ${event.command}`);
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      clearNowPlayingInfo();
    };
  }, []);

  const chooseFile = async () => {
    const paths = await openFileDialog({
      allowedFileTypes: audioFileTypes,
      allowsMultipleSelection: false,
    });
    const path = paths?.[0];
    if (!path) {
      setStatus("File selection canceled.");
      return;
    }

    setFilePath(path);
    setStatus(`Loading ${fileNameFromPath(path)}...`);
    const result = await loadTrack(path);
    if (!result.success) {
      setStatus(result.error ?? "Failed to load track.");
      return;
    }

    const tags = await readMediaTags(path, { includeArtwork: false });
    updateNowPlayingInfo({
      album: tags.album,
      artist: tags.artist,
      duration: tags.durationSeconds,
      title: tags.title ?? fileNameFromPath(path),
    });
  };

  const seekForward = async () => {
    const state = await getCurrentState();
    const target = state.duration > 0 ? Math.min(state.currentTime + 15, state.duration) : state.currentTime + 15;
    const result = await seek(target);
    setStatus(result.success ? `Seeked to ${formatSeconds(target)}.` : (result.error ?? "Seek failed."));
  };

  return (
    <ExamplePanel title="Audio Player">
      <Text style={styles.bodyText}>{filePath ? fileNameFromPath(filePath) : "No file loaded."}</Text>
      <Text style={styles.resultText}>{progress}</Text>
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton onPress={() => void chooseFile()}>Choose Audio File</ExampleButton>
      <ExampleButton onPress={() => void play()}>Play</ExampleButton>
      <ExampleButton onPress={() => void pause()}>Pause</ExampleButton>
      <ExampleButton onPress={() => void stop()}>Stop</ExampleButton>
      <ExampleButton onPress={() => void seekForward()}>Seek +15s</ExampleButton>
    </ExamplePanel>
  );
}
