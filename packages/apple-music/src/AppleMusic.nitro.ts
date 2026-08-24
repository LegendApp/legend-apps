import type { HybridObject } from "react-native-nitro-modules";

export interface AppleMusicAvailability {
  available: boolean;
  message: string;
}

export interface AppleMusicAuthorization {
  developerToken: string;
  userToken: string;
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
  getDeveloperToken(): Promise<string>;
  authorize(): Promise<AppleMusicAuthorization>;
  configure(developerToken: string, userToken: string): Promise<void>;
  logout(): Promise<void>;
  loadTrack(trackId: string, startPositionSeconds: number): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  stop(): Promise<void>;
  getPlaybackState(): Promise<AppleMusicPlaybackState>;
}
