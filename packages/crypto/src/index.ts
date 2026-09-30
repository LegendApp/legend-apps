import { NitroModules } from "react-native-nitro-modules";
import type { SecureStorage } from "./SecureStorage.nitro";
let native: SecureStorage | undefined;
/** Cryptographically secure, unpadded URL-safe random bytes. */
export function randomBase64Url(length: number): string {
  if (!Number.isInteger(length) || length < 1 || length > 4096) throw new Error("Random byte length must be between 1 and 4096");
  native ??= NitroModules.createHybridObject<SecureStorage>("SecureStorage");
  return native.randomBase64Url(length);
}
