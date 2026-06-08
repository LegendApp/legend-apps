import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  getApplicationSupportDirectory(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeStorage");
