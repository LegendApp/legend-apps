import { createMenu, type MenuRootItem } from "@legendapp/spark/menus";
export type KitchenSinkPackage = { id: string; title: string };
export type KitchenSinkTest = { id: string; title: string; packageId: string };
type KitchenSinkMenuAction = { type: "package"; id: string } | { type: "test"; id: string; packageId: string };
export function createKitchenSinkMenus(packages: KitchenSinkPackage[], tests: KitchenSinkTest[], listener: (action: KitchenSinkMenuAction) => void) {
 const actions = new Map<string, KitchenSinkMenuAction>();
 const items: MenuRootItem[] = [{ type: "submenu", id: "packages", label: "Packages", items: packages.map(item => { const id = `package:${item.id}`; actions.set(id, { type: "package", id: item.id }); return { type: "action", id, label: item.title }; }) },
 { type: "submenu", id: "tests", label: "Test", items: tests.map(item => { const id = `test:${item.packageId}:${item.id}`; actions.set(id, { type: "test", id: item.id, packageId: item.packageId }); return { type: "action", id, label: item.title }; }) }];
 return createMenu({ id: "kitchen-sink-navigation", items, onAction(action) { const value = actions.get(action.itemId); if (action.type === "action" && value) listener(value); } });
}
