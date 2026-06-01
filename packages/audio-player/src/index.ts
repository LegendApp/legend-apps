import { NativeEventEmitter, Platform } from "react-native";
import NativeAudioPlayer from "./NativeAudioPlayer";

export type AudioPlayerState = Readonly<{
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
}>;

export type AudioPlayerResult = Readonly<{
  error?: string;
  success: boolean;
}>;

export type RemoteCommand = "play" | "pause" | "toggle" | "next" | "previous";

export type NowPlayingInfoPayload = Readonly<{
  album?: string | null;
  artist?: string | null;
  artwork?: string | null;
  duration?: number | null;
  elapsedTime?: number | null;
  isPlaying?: boolean | null;
  playbackRate?: number | null;
  title?: string | null;
}>;

export type AudioPlayerEvents = {
  onCompletion: () => void;
  onLoadError: (event: { error: string }) => void;
  onLoadSuccess: (event: { duration: number }) => void;
  onOcclusionChanged: (event: { isOccluded: boolean }) => void;
  onPlaybackStateChanged: (event: { isPlaying: boolean }) => void;
  onProgress: (event: { currentTime: number; duration?: number }) => void;
  onRemoteCommand: (event: { command: RemoteCommand }) => void;
};

const fallbackState: AudioPlayerState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: 1,
};

const emitter = new NativeEventEmitter(NativeAudioPlayer);

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function unsupportedResult(): Promise<AudioPlayerResult> {
  return Promise.resolve({ success: false, error: "Audio player is only available on Apple platforms." });
}

export function loadTrack(filePath: string) {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.loadTrack(filePath).then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function play() {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.play().then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function pause() {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.pause().then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function stop() {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.stop().then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function seek(seconds: number) {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.seek(seconds).then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function setVolume(volume: number) {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return unsupportedResult();
  }
  return NativeAudioPlayer.setVolume(volume).then((json) => parseJson<AudioPlayerResult>(json, { success: false }));
}

export function getCurrentAudioState() {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return Promise.resolve(fallbackState);
  }
  return NativeAudioPlayer.getCurrentState().then((json) => parseJson<AudioPlayerState>(json, fallbackState));
}

export function updateNowPlayingInfo(payload: NowPlayingInfoPayload) {
  if (Platform.OS === "macos" || Platform.OS === "ios") {
    NativeAudioPlayer.updateNowPlayingInfo(JSON.stringify(payload));
  }
}

export function clearNowPlayingInfo() {
  if (Platform.OS === "macos" || Platform.OS === "ios") {
    NativeAudioPlayer.clearNowPlayingInfo();
  }
}

export function addAudioPlayerListener<T extends keyof AudioPlayerEvents>(
  eventName: T,
  listener: AudioPlayerEvents[T],
) {
  if (Platform.OS !== "macos" && Platform.OS !== "ios") {
    return { remove() {} };
  }
  const subscription = emitter.addListener(eventName, listener);
  return { remove: () => subscription.remove() };
}

export const audioPlayer = {
  addListener: addAudioPlayerListener,
  clearNowPlayingInfo,
  getCurrentState: getCurrentAudioState,
  loadTrack,
  pause,
  play,
  seek,
  setVolume,
  stop,
  updateNowPlayingInfo,
};

export { NativeAudioPlayer };
