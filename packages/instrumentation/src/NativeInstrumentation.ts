import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  log(category: string, message: string): void;
}

const nativeInstrumentation = TurboModuleRegistry
  ? TurboModuleRegistry.get<Spec>("NativeInstrumentation")
  : null;

export default nativeInstrumentation;
