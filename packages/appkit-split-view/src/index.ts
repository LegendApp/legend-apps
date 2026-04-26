import { NativeEventEmitter, Platform } from "react-native";
import NativeAppKitSplitView, { type NativeMenuPackage, type NativeMenuTest } from "./NativeAppKitSplitView";
import AppKitSplitViewNativeComponent from "./AppKitSplitViewNativeComponent";

export type AppKitSplitViewMenuAction =
  | { type: "package"; id: string }
  | { type: "test"; id: string; packageId: string };

export type KitchenSinkPackage = NativeMenuPackage;
export type KitchenSinkTest = NativeMenuTest;

export const AppKitSplitView = AppKitSplitViewNativeComponent;

export function configureKitchenSinkMenus(
  packages: KitchenSinkPackage[],
  tests: KitchenSinkTest[],
) {
  if (Platform.OS === "macos") {
    NativeAppKitSplitView.configureKitchenSinkMenus(JSON.stringify(packages), JSON.stringify(tests));
  }
}

export function clearKitchenSinkMenus() {
  if (Platform.OS === "macos") {
    NativeAppKitSplitView.clearKitchenSinkMenus();
  }
}

export function addKitchenSinkMenuListener(listener: (action: AppKitSplitViewMenuAction) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeAppKitSplitView as never);
  return emitter.addListener("AppKitSplitViewMenuAction", listener);
}
