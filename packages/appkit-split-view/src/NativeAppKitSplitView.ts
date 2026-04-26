import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export type NativeMenuPackage = {
  id: string;
  title: string;
};

export type NativeMenuTest = {
  id: string;
  title: string;
  packageId: string;
};

export interface Spec extends TurboModule {
  configureKitchenSinkMenus(packagesJson: string, testsJson: string): void;
  clearKitchenSinkMenus(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeAppKitSplitView");
