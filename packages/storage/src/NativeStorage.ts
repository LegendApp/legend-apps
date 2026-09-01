import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  deleteStoragePath(root: string, relativePath: string): boolean;
  ensureStorageDirectory(root: string, relativePath: string): boolean;
  getStoragePathUri(root: string, relativePath: string): string;
  listStorageDirectoryJson(root: string, relativePath: string): string;
  readStorageText(root: string, relativePath: string): string | null;
  readTextFile(pathOrUri: string): string | null;
  writeStorageText(root: string, relativePath: string, value: string): boolean;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeStorage");
