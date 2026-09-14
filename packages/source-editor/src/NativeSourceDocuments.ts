import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  prepare(path: string): string;
  snapshot(token: string, path: string): string;
  cancel(token: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeSourceDocuments");
