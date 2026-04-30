import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  parseMarkdown(markdown: string, optionsJson: string): Promise<string>;
  parseMarkdownFile(filePath: string, optionsJson: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeMarkdownParser");
