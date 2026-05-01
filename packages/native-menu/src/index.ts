import { NativeEventEmitter, Platform } from "react-native";
import NativeMenu from "./NativeMenu";

export type NativeMenuShortcut = {
  key: string;
  modifiers?: number;
};

export type NativeMenuItem = {
  id: string;
  title?: string;
  targetTitle?: string;
  targetPath?: string[];
  enabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  shortcut?: NativeMenuShortcut | null;
  payload?: Record<string, unknown>;
};

export type NativeMenuConfig = {
  id: string;
  title: string;
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

export { default as NativeMenu } from "./NativeMenu";
