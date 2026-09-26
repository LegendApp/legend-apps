import { addNativeMenuActionListener, clearMenus, configureMenus } from "@legendapp/spark/menus";

export type KitchenSinkPackage = { id: string; title: string };
export type KitchenSinkTest = { id: string; title: string; packageId: string };
type KitchenSinkMenuAction = { type: "package"; id: string } | { type: "test"; id: string; packageId: string };
const ownerId = "kitchen-sink.navigation";

export function configureKitchenSinkMenus(packages: KitchenSinkPackage[], tests: KitchenSinkTest[]) {
  configureMenus(ownerId, [
    { id: "packages", title: "Packages", items: packages.map(item => ({ id: `package:${item.id}`, title: item.title, payload: { type: "package", id: item.id } })) },
    { id: "tests", title: "Test", items: tests.map(item => ({ id: `test:${item.packageId}:${item.id}`, title: item.title, payload: { type: "test", id: item.id, packageId: item.packageId } })) },
  ]);
}

export function addKitchenSinkMenuListener(listener: (action: KitchenSinkMenuAction) => void) {
  const subscription = addNativeMenuActionListener(action => {
    if (action.ownerId !== ownerId) return;
    const payload = action.payload;
    if (payload?.type === "package" && typeof payload.id === "string") listener({ type: "package", id: payload.id });
    if (payload?.type === "test" && typeof payload.id === "string" && typeof payload.packageId === "string") listener({ type: "test", id: payload.id, packageId: payload.packageId });
  });
  return { remove() { subscription.remove(); clearMenus(ownerId); } };
}
