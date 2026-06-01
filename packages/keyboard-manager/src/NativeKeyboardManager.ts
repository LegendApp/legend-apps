import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  startMonitoringKeyboard(): Promise<boolean>;
  stopMonitoringKeyboard(): Promise<boolean>;
  respondToKeyEvent(eventId: string, handled: boolean): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeKeyboardManager");
