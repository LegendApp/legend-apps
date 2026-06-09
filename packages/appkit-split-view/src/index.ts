import { createElement, type ReactNode } from "react";
import {
  NativeEventEmitter,
  Platform,
  StyleSheet,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";
import NativeAppKitSplitView, { type NativeMenuPackage, type NativeMenuTest } from "./NativeAppKitSplitView";
import SidebarSplitViewNativeComponent, {
  type SidebarSplitViewResizeEvent,
} from "./SidebarSplitViewNativeComponent";

export type AppKitSplitViewMenuAction =
  | { type: "package"; id: string }
  | { type: "test"; id: string; packageId: string };

export type KitchenSinkPackage = NativeMenuPackage;
export type KitchenSinkTest = NativeMenuTest;
export type { SidebarSplitViewResizeEvent };
export type SidebarSplitViewAppearance = "system" | "light" | "dark";

export interface SidebarSplitViewProps extends ViewProps {
  appearance?: SidebarSplitViewAppearance;
  children?: ReactNode;
  className?: string;
  contentMinWidth?: number;
  onSplitViewDidResize?: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void | Promise<void>;
  sidebarMinWidth?: number;
}

export function SidebarSplitView({
  appearance = "system",
  children,
  contentMinWidth = 320,
  sidebarMinWidth = 180,
  style,
  ...props
}: SidebarSplitViewProps) {
  return createElement(
    SidebarSplitViewNativeComponent,
    {
      appearance,
      contentMinWidth,
      sidebarMinWidth,
      style: [styles.root, style],
      ...props,
    },
    children,
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
  },
});

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
