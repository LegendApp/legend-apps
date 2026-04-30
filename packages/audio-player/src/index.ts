import { NativeEventEmitter, Platform } from "react-native";
import NativeAudioPlayer from "./NativeAudioPlayer";

export type AudioPlayerResult = Readonly<{
  success: boolean;
  error?: string;
}>;

export type AudioPlayerState = Readonly<{
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
}>;

export type RemoteCommand = "play" | "pause" | "toggle" | "next" | "previous";

export type NowPlayingInfoPayload = Readonly<{
  album?: string;
  artist?: string;
  duration?: number;
  elapsedTime?: number;
  isPlaying?: boolean;
  playbackRate?: number;
  title?: string;
}>;

export type AudioPlayerEvents = {
  onCompletion: () => void;
  onLoadError: (event: { error: string }) => void;
  onLoadSuccess: (event: { duration: number }) => void;
  onOcclusionChanged: (event: { isOccluded: boolean }) => void;
  onPlaybackStateChanged: (event: { isPlaying: boolean }) => void;
  onProgress: (event: { currentTime: number; duration: number }) => void;
  onRemoteCommand: (event: { command: RemoteCommand }) => void;
};

const emitter = new NativeEventEmitter(NativeAudioPlayer);

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

const unsupportedResult = (message = "AudioPlayer is not available on this platform"): AudioPlayerResult => ({
  error: message,
  success: false,
});

async function resultFromPromise(promise: Promise<string>) {
  return parseJson<AudioPlayerResult>(await promise, unsupportedResult("Invalid native response"));
}

export function loadTrack(filePath: string) {
  return resultFromPromise(NativeAudioPlayer.loadTrack(filePath));
}

export function play() {
  return resultFromPromise(NativeAudioPlayer.play());
}

export function pause() {
  return resultFromPromise(NativeAudioPlayer.pause());
}

export function stop() {
  return resultFromPromise(NativeAudioPlayer.stop());
}

export function seek(seconds: number) {
  return resultFromPromise(NativeAudioPlayer.seek(seconds));
}

export function setVolume(volume: number) {
  return resultFromPromise(NativeAudioPlayer.setVolume(volume));
}

export async function getCurrentState() {
  return parseJson<AudioPlayerState>(await NativeAudioPlayer.getCurrentState(), {
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    volume: 1,
  });
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
  const subscription = emitter.addListener(eventName, listener);
  return { remove: () => subscription.remove() };
}

export const AudioPlayer = {
  addListener: addAudioPlayerListener,
  clearNowPlayingInfo,
  getCurrentState,
  loadTrack,
  pause,
  play,
  seek,
  setVolume,
  stop,
  updateNowPlayingInfo,
};

export { default as NativeAudioPlayer } from "./NativeAudioPlayer";
