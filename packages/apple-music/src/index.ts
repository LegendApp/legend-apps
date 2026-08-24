import { NitroModules } from "react-native-nitro-modules";
import type { AppleMusic } from "./AppleMusic.nitro";

let appleMusic: AppleMusic | undefined;

export function getAppleMusic(): AppleMusic {
  appleMusic ??= NitroModules.createHybridObject<AppleMusic>("AppleMusic");
  return appleMusic;
}

export type {
  AppleMusic,
  AppleMusicAuthorization,
  AppleMusicAvailability,
  AppleMusicPlaybackState,
} from "./AppleMusic.nitro";
