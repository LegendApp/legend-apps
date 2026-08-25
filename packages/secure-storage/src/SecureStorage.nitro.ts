import type { HybridObject } from "react-native-nitro-modules";

export interface SecureStorage extends HybridObject<{ ios: "swift" }> {
  get(service: string, key: string): string;
  set(service: string, key: string, value: string): void;
  remove(service: string, key: string): void;
  randomBase64Url(byteCount: number): string;
}
