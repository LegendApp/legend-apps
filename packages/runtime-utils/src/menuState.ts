import type { MenuItem, MenuRootItem } from "@legendapp/spark/menus";
export type MenuState = { disabled?: boolean; hidden?: boolean; checked?: boolean; label?: string; shortcut?: string };
/** Derive a complete menu tree from application state. */
export function withMenuState(items: readonly MenuRootItem[], state: Readonly<Record<string, MenuState>>): MenuRootItem[];
export function withMenuState(items: readonly MenuItem[], state: Readonly<Record<string, MenuState>>): MenuItem[];
export function withMenuState(items: readonly MenuItem[], state: Readonly<Record<string, MenuState>>): MenuItem[] {
  return items.map(item => {
    if (item.type === "separator") return item;
    if (item.type === "submenu") return { ...item, items: withMenuState(item.items, state) };
    const value = state[item.id];
    if (!value) return item;
    const { checked, ...rest } = value;
    if (checked !== undefined && (item.type === "action" || item.type === "checkbox")) return { ...item, ...rest, type: "checkbox", checked };
    return { ...item, ...rest };
  });
}
