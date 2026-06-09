import type { TurboModule } from "react-native";
import { TurboModuleRegistry } from "react-native";

export interface Spec extends TurboModule {
  getConstantsJson(): string;
  openWindow(optionsJson: string): Promise<string>;
  closeWindow(identifier: string): Promise<string>;
  closeFrontmostWindow(): Promise<string>;
  showMainWindow(): Promise<string>;
  setMainWindowOptions(optionsJson: string): Promise<string>;
  setWindowOptions(identifier: string, optionsJson: string): Promise<string>;
  getMainWindowFrame(): Promise<string>;
  setMainWindowFrame(frameJson: string): Promise<string>;
  setWindowBlur(identifier: string, radius: number, durationMs: number): Promise<string>;
  setWindowTitle(identifier: string, title: string): Promise<string>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>("NativeWindowManager");
