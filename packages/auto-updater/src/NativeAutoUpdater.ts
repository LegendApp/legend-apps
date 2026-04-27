import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  isAvailable(): boolean;
  checkForUpdates(): Promise<boolean>;
  checkForUpdatesInBackground(): Promise<boolean>;
  getAutomaticallyChecksForUpdates(): Promise<boolean>;
  setAutomaticallyChecksForUpdates(value: boolean): Promise<boolean>;
  getUpdateCheckInterval(): Promise<number>;
  setUpdateCheckInterval(interval: number): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeAutoUpdater");
