import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  showMenu(itemsJson: string, locationJson: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeContextMenu");
