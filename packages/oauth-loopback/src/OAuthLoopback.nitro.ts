import type { HybridObject } from "react-native-nitro-modules";

export interface OAuthLoopback extends HybridObject<{ ios: "swift" }> {
  start(callbackPath: string): Promise<string>;
  waitForCallback(timeoutMs: number): Promise<string>;
  cancel(): void;
}
