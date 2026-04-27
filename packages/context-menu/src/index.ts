import { Platform } from "react-native";
import NativeContextMenu from "./NativeContextMenu";

export type ContextMenuItem = {
  id: string;
  title: string;
  enabled?: boolean;
};

export type ContextMenuLocation = {
  x: number;
  y: number;
};

export async function showContextMenu(items: ContextMenuItem[], location: ContextMenuLocation) {
  if (Platform.OS !== "macos") {
    return null;
  }

  const result = await NativeContextMenu.showMenu(JSON.stringify(items), JSON.stringify(location));
  return result.length > 0 ? result : null;
}

export { default as NativeContextMenu } from "./NativeContextMenu";
