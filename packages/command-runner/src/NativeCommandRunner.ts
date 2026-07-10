import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  getAvailability(commandsJson: string): Promise<string>;
  runCommand(paramsJson: string): Promise<string>;
  runCommands(paramsJson: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>("NativeCommandRunner");
