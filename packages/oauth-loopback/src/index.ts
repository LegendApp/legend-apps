import { NitroModules } from "react-native-nitro-modules";
import type { OAuthLoopback } from "./OAuthLoopback.nitro";

let oauthLoopback: OAuthLoopback | undefined;

export function getOAuthLoopback(): OAuthLoopback {
  oauthLoopback ??= NitroModules.createHybridObject<OAuthLoopback>("OAuthLoopback");
  return oauthLoopback;
}

export type { OAuthLoopback } from "./OAuthLoopback.nitro";
