import { NitroModules } from "react-native-nitro-modules";
import type { SecureStorage } from "./SecureStorage.nitro";

let secureStorage: SecureStorage | undefined;

export function getSecureStorage(): SecureStorage {
  secureStorage ??= NitroModules.createHybridObject<SecureStorage>("SecureStorage");
  return secureStorage;
}

export type { SecureStorage } from "./SecureStorage.nitro";
