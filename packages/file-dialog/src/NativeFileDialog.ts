import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  open(optionsJson: string): Promise<string>;
  readTextFile(path: string): Promise<string>;
  save(optionsJson: string): Promise<string>;
  revealInFinder(path: string): Promise<boolean>;
  writeTextFile(path: string, contents: string): Promise<void>;
  writeTextFileIfUnchanged(path: string, expectedContents: string, contents: string): Promise<boolean>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeFileDialog");
