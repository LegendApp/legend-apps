import { Children, createElement, useCallback, useState, type ReactNode } from "react";
import {
  NativeEventEmitter,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";
import NativeAppKitSplitView, { type NativeMenuPackage, type NativeMenuTest } from "./NativeAppKitSplitView";
import AppKitSplitViewNativeComponent from "./AppKitSplitViewNativeComponent";
import SidebarSplitViewNativeComponent, {
  type SidebarSplitViewResizeEvent,
} from "./SidebarSplitViewNativeComponent";

export type AppKitSplitViewMenuAction =
  | { type: "package"; id: string }
  | { type: "test"; id: string; packageId: string };

export type KitchenSinkPackage = NativeMenuPackage;
export type KitchenSinkTest = NativeMenuTest;
export type { SidebarSplitViewResizeEvent };

export const AppKitSplitView = AppKitSplitViewNativeComponent;

export interface SidebarSplitViewProps extends ViewProps {
  children?: ReactNode;
  className?: string;
  contentMinWidth?: number;
  onSplitViewDidResize?: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void | Promise<void>;
  sidebarMinWidth?: number;
}

type SidebarPaneLayout = {
  contentWidth: number;
  height: number;
  sidebarWidth: number;
};

export function SidebarSplitView({
  children,
  className,
  contentMinWidth = 320,
  onLayout,
  onSplitViewDidResize,
  sidebarMinWidth = 180,
  style,
  ...props
}: SidebarSplitViewProps) {
  const [paneLayout, setPaneLayout] = useState<SidebarPaneLayout>({
    contentWidth: 0,
    height: 0,
    sidebarWidth: 0,
  });

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);

      const height = Math.round(event.nativeEvent.layout.height);
      if (height > 0) {
        setPaneLayout((current) => {
          if (current.height === height) {
            return current;
          }

          return { ...current, height };
        });
      }
    },
    [onLayout],
  );

  const handleSplitViewDidResize = useCallback(
    (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
      void onSplitViewDidResize?.(event);

      const { contentWidth, sidebarWidth } = event.nativeEvent;
      if (contentWidth > 0 && sidebarWidth > 0) {
        setPaneLayout((current) => {
          const nextLayout = {
            contentWidth: Math.round(contentWidth),
            height: current.height,
            sidebarWidth: Math.round(sidebarWidth),
          };

          if (
            current.contentWidth === nextLayout.contentWidth &&
            current.height === nextLayout.height &&
            current.sidebarWidth === nextLayout.sidebarWidth
          ) {
            return current;
          }

          return nextLayout;
        });
      }
    },
    [onSplitViewDidResize],
  );

  const childArray = Children.toArray(children);
  const sidebarChild = childArray[0] ?? null;
  const contentChild = childArray[1] ?? null;
  const sidebarPaneStyle = [
    styles.pane,
    paneLayout.height > 0 ? { height: paneLayout.height } : null,
    paneLayout.sidebarWidth > 0 ? { width: paneLayout.sidebarWidth } : styles.unsizedPane,
  ];
  const contentPaneStyle = [
    styles.pane,
    paneLayout.height > 0 ? { height: paneLayout.height } : null,
    paneLayout.contentWidth > 0 ? { width: paneLayout.contentWidth } : styles.unsizedPane,
  ];

  return createElement(
    SidebarSplitViewNativeComponent,
    {
      className,
      contentMinWidth,
      onLayout: handleLayout,
      onSplitViewDidResize: handleSplitViewDidResize,
      sidebarMinWidth,
      style,
      ...props,
    },
    createElement(View, { style: sidebarPaneStyle }, sidebarChild),
    createElement(View, { style: contentPaneStyle }, contentChild),
  );
}

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

const styles = StyleSheet.create({
  pane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
  },
  unsizedPane: {
    flex: 1,
  },
});
