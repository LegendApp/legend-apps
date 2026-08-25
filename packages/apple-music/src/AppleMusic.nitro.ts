import type { HybridObject } from "react-native-nitro-modules";

export interface AppleMusicAvailability {
  available: boolean;
  message: string;
}

export interface AppleMusicAuthorization {
  authorized: boolean;
  status: string;
  storefront: string;
  userName: string;
  subscription: string;
}

export interface AppleMusicPlaybackState {
  trackId: string;
  isPlaying: boolean;
  isLoading: boolean;
  positionSeconds: number;
  durationSeconds: number;
  artworkUrl: string;
  didComplete: boolean;
  error: string;
}

export interface AppleMusic extends HybridObject<{ ios: "swift" }> {
  getAvailability(): AppleMusicAvailability;
  getAuthorization(): Promise<AppleMusicAuthorization>;
  authorize(): Promise<AppleMusicAuthorization>;
  request(path: string): Promise<string>;
  logout(): Promise<void>;
  loadTrack(trackId: string, startPositionSeconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  getPlaybackState(): Promise<AppleMusicPlaybackState>;
}
