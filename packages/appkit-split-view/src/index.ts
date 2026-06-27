import { Children, createElement, type ReactNode } from "react";
import {
  NativeEventEmitter,
  Platform,
  StyleSheet,
  View,
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
export type SidebarSplitViewTitlebarMaterial = "none" | "glass" | "titlebar" | "headerView" | "hudWindow" | "sidebar" | "windowBackground";

export interface SidebarSplitViewProps extends ViewProps {
  appearance?: SidebarSplitViewAppearance;
  children?: ReactNode;
  className?: string;
  contentMinWidth?: number;
  contentTitlebarHeight?: number;
  contentTitlebarMaterial?: SidebarSplitViewTitlebarMaterial;
  contentTitlebarOverlayColor?: string;
  contentTitlebarOverlayOpacity?: number;
  onSplitViewDidResize?: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void | Promise<void>;
  sidebarCollapsed?: boolean;
  sidebarMinWidth?: number;
}

export function SidebarSplitView({
  appearance = "system",
  children,
  contentMinWidth = 320,
  contentTitlebarHeight = 0,
  contentTitlebarMaterial = "none",
  contentTitlebarOverlayColor,
  contentTitlebarOverlayOpacity = 0,
  onSplitViewDidResize,
  sidebarCollapsed = false,
  sidebarMinWidth = 180,
  style,
  ...props
}: SidebarSplitViewProps) {
  const panes = Children.toArray(children);

  return createElement(
    SidebarSplitViewNativeComponent,
    {
      appearance,
      contentMinWidth,
      contentTitlebarHeight,
      contentTitlebarMaterial,
      contentTitlebarOverlayColor,
      contentTitlebarOverlayOpacity,
      onSplitViewDidResize,
      sidebarCollapsed,
      sidebarMinWidth,
      style: [styles.root, style],
      ...props,
    },
    createElement(
      View,
      {
        key: "sidebar",
        style: styles.pane,
      },
      panes[0],
    ),
    createElement(
      View,
      {
        key: "content",
        style: styles.pane,
      },
      panes[1],
    ),
    panes.slice(2),
  );
}

const styles = StyleSheet.create({
  root: {},
  pane: {
    bottom: 0,
    left: 0,
    minWidth: 0,
    position: "absolute",
    right: 0,
    top: 0,
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
