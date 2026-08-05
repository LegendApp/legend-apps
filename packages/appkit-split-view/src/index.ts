import { Children, createElement, useCallback, useState, type ReactNode } from "react";
import {
  NativeEventEmitter,
  Platform,
  StyleSheet,
  TurboModuleRegistry,
  View,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";
import type { NativeMenuPackage, NativeMenuTest, Spec as NativeAppKitSplitViewSpec } from "./NativeAppKitSplitView";
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

export type SidebarSplitViewPaneMetrics = {
  contentHeight: number;
  contentWidth: number;
  sidebarHeight: number;
  sidebarWidth: number;
};

let nativeAppKitSplitView: NativeAppKitSplitViewSpec | null = null;

function getNativeAppKitSplitView() {
  if (!nativeAppKitSplitView) {
    nativeAppKitSplitView = TurboModuleRegistry.getEnforcing<NativeAppKitSplitViewSpec>("NativeAppKitSplitView");
  }
  return nativeAppKitSplitView;
}

export interface SidebarSplitViewProps extends ViewProps {
  appearance?: SidebarSplitViewAppearance;
  children?: ReactNode;
  className?: string;
  contentMinWidth?: number;
  contentTitlebarHeight?: number;
  contentTitlebarMaterial?: SidebarSplitViewTitlebarMaterial;
  contentTitlebarOverlayColor?: string;
  contentTitlebarOverlayOpacity?: number;
  initialPaneMetrics?: SidebarSplitViewPaneMetrics | null;
  onSplitViewDidResize?: (event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => void | Promise<void>;
  sidebarCollapsed?: boolean;
  sidebarMinWidth?: number;
  sidebarTitlebarOverlayColor?: string;
  sidebarTitlebarOverlayOpacity?: number;
  sidebarWidth?: number;
}

export function SidebarSplitView({
  appearance = "system",
  children,
  contentMinWidth = 320,
  contentTitlebarHeight = 0,
  contentTitlebarMaterial = "none",
  contentTitlebarOverlayColor,
  contentTitlebarOverlayOpacity = 0,
  initialPaneMetrics,
  onSplitViewDidResize,
  sidebarCollapsed = false,
  sidebarMinWidth = 180,
  sidebarTitlebarOverlayColor,
  sidebarTitlebarOverlayOpacity = 0,
  sidebarWidth,
  style,
  ...props
}: SidebarSplitViewProps) {
  const [paneMetrics, setPaneMetrics] = useState({
    contentHeight: initialPaneMetrics?.contentHeight ?? 0,
    contentWidth: initialPaneMetrics?.contentWidth ?? 0,
    sidebarHeight: initialPaneMetrics?.sidebarHeight ?? 0,
    sidebarWidth: initialPaneMetrics?.sidebarWidth ?? 0,
  });
  const panes = Children.toArray(children);

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextContentHeight = Math.round(event.nativeEvent.contentHeight || event.nativeEvent.height);
    const nextContentWidth = Math.round(event.nativeEvent.contentWidth);
    const nextSidebarHeight = Math.round(event.nativeEvent.sidebarHeight || event.nativeEvent.height);
    const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);

    if (nextContentHeight > 0 || nextContentWidth > 0 || nextSidebarHeight > 0 || nextSidebarWidth > 0) {
      setPaneMetrics((current) => {
        const next = {
          contentHeight: nextContentHeight > 0 ? nextContentHeight : current.contentHeight,
          contentWidth: nextContentWidth > 0 ? nextContentWidth : current.contentWidth,
          sidebarHeight: nextSidebarHeight > 0 ? nextSidebarHeight : current.sidebarHeight,
          sidebarWidth: nextSidebarWidth > 0 ? nextSidebarWidth : current.sidebarWidth,
        };
        return current.contentHeight === next.contentHeight &&
          current.contentWidth === next.contentWidth &&
          current.sidebarHeight === next.sidebarHeight &&
          current.sidebarWidth === next.sidebarWidth
          ? current
          : next;
      });
    }

    // Provisional metrics stabilize the pane wrappers without exposing an incomplete layout to consumers.
    if (event.nativeEvent.isLayoutReady) {
      onSplitViewDidResize?.(event);
    }
  }, [onSplitViewDidResize]);

  return createElement(
    SidebarSplitViewNativeComponent,
    {
      appearance,
      contentMinWidth,
      contentTitlebarHeight,
      contentTitlebarMaterial,
      contentTitlebarOverlayColor,
      contentTitlebarOverlayOpacity,
      onSplitViewDidResize: handleSplitViewResize,
      sidebarCollapsed,
      sidebarMinWidth,
      sidebarTitlebarOverlayColor,
      sidebarTitlebarOverlayOpacity,
      sidebarWidth,
      style: [styles.root, style],
      ...props,
    },
    createElement(
      View,
      {
        key: "sidebar",
        style: [
          styles.pane,
          {
            height: paneMetrics.sidebarHeight || undefined,
            minHeight: paneMetrics.sidebarHeight || undefined,
            width: sidebarCollapsed ? 0 : paneMetrics.sidebarWidth || sidebarWidth || sidebarMinWidth,
          },
        ],
      },
      panes[0],
    ),
    createElement(
      View,
      {
        key: "content",
        style: [
          styles.pane,
          {
            height: paneMetrics.contentHeight || undefined,
            minHeight: paneMetrics.contentHeight || undefined,
            width: paneMetrics.contentWidth || undefined,
          },
        ],
      },
      panes[1],
    ),
    panes.slice(2),
  );
}

const styles = StyleSheet.create({
  root: {},
  pane: {
    left: 0,
    minWidth: 0,
    position: "absolute",
    top: 0,
  },
});

export function configureKitchenSinkMenus(
  packages: KitchenSinkPackage[],
  tests: KitchenSinkTest[],
) {
  if (Platform.OS === "macos") {
    getNativeAppKitSplitView().configureKitchenSinkMenus(JSON.stringify(packages), JSON.stringify(tests));
  }
}

export function clearKitchenSinkMenus() {
  if (Platform.OS === "macos") {
    getNativeAppKitSplitView().clearKitchenSinkMenus();
  }
}

export function addKitchenSinkMenuListener(listener: (action: AppKitSplitViewMenuAction) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(getNativeAppKitSplitView() as never);
  return emitter.addListener("AppKitSplitViewMenuAction", listener);
}
