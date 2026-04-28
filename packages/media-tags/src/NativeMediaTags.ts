import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  readMediaTags(filePath: string, optionsJson: string): Promise<string>;
  writeMediaTags(filePath: string, updatesJson: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeMediaTags");
