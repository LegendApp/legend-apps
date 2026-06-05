import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  open(optionsJson: string): Promise<string>;
  save(optionsJson: string): Promise<string>;
  createTemporaryTextFile(prefix: string, extension: string, contents: string): Promise<string>;
  removeFile(path: string): Promise<boolean>;
  revealInFinder(path: string): Promise<boolean>;
  writeTextFile(path: string, contents: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeFileDialog");
