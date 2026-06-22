import { NativeEventEmitter, Platform } from "react-native";
import { useEffect } from "react";
import NativeMenu from "./NativeMenu";

export type NativeMenuShortcut = {
  key: string;
  modifiers?: number;
};

export type NativeMenuItem = {
  id: string;
  title?: string;
  targetTitle?: string;
  targetTitles?: string[];
  targetPath?: string[];
  enabled?: boolean;
  checked?: boolean;
  hidden?: boolean;
  separator?: boolean;
  shortcut?: NativeMenuShortcut | null;
  payload?: Record<string, unknown>;
};

export type NativeMenuConfig = {
  id: string;
  title: string;
  systemMenu?: "app";
  placement?: {
    before?: string;
    after?: string;
  };
  items: NativeMenuItem[];
};

export type NativeMenuItemPatch = Omit<Partial<NativeMenuItem>, "separator"> & {
  id: string;
};

export type NativeMenuAction = {
  ownerId: string;
  menuId: string;
  itemId: string;
  payload?: Record<string, unknown>;
};

export type NativeMenuActionHandlers = Record<string, (action: NativeMenuAction) => void>;

export type UseNativeMenuOptions = {
  handlers?: NativeMenuActionHandlers;
  menus: NativeMenuConfig[];
  onAction?: (action: NativeMenuAction) => void;
  ownerId: string;
};

export function configureMenus(ownerId: string, menus: NativeMenuConfig[]) {
  if (Platform.OS === "macos") {
    NativeMenu.configureMenus(ownerId, JSON.stringify(menus));
  }
}

export function updateMenuItems(ownerId: string, patches: NativeMenuItemPatch[]) {
  if (Platform.OS === "macos") {
    NativeMenu.updateMenuItems(ownerId, JSON.stringify(patches));
  }
}

export function clearMenus(ownerId: string) {
  if (Platform.OS === "macos") {
    NativeMenu.clearMenus(ownerId);
  }
}

export function clearAllMenus() {
  if (Platform.OS === "macos") {
    NativeMenu.clearAllMenus();
  }
}

export function addNativeMenuActionListener(listener: (action: NativeMenuAction) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeMenu as never);
  return emitter.addListener("NativeMenuAction", listener);
}

export function useNativeMenu({ handlers, menus, onAction, ownerId }: UseNativeMenuOptions) {
  useEffect(() => {
    configureMenus(ownerId, menus);

    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId === ownerId) {
        const handler = handlers?.[action.itemId];
        if (handler) {
          handler(action);
        } else {
          onAction?.(action);
        }
      }
    });

    return () => {
      subscription.remove();
      clearMenus(ownerId);
    };
  }, [handlers, menus, onAction, ownerId]);
}

export { default as NativeMenu } from "./NativeMenu";
