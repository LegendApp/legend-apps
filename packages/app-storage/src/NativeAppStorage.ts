import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  getString(key: string): Promise<string>;
  setString(key: string, value: string): Promise<boolean>;
  removeItem(key: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeAppStorage");
