import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  loadTrack(filePath: string): Promise<string>;
  play(): Promise<string>;
  pause(): Promise<string>;
  stop(): Promise<string>;
  seek(seconds: number): Promise<string>;
  setVolume(volume: number): Promise<string>;
  getCurrentState(): Promise<string>;
  updateNowPlayingInfo(payloadJson: string): void;
  clearNowPlayingInfo(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeAudioPlayer");
