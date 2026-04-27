import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  configureMenus(ownerId: string, menusJson: string): void;
  updateMenuItems(ownerId: string, patchesJson: string): void;
  clearMenus(ownerId: string): void;
  clearAllMenus(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeMenu");
