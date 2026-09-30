import { createMenu } from "@legendapp/spark/menus";
import { checkForUpdates, getUpdateStatus } from "@legendapp/spark/updates";
import { settings$ } from "../settings/SettingsFile";
import { state$ } from "./State";
export async function initializeMenuManager() {
  const status = await getUpdateStatus();
  return createMenu({ id: "photos", items: [
    { type: "submenu", id: "app", label: "Legend Photos", target: { menu: "app" }, items: [
      { type: "action", id: "settings", label: "Settings…", target: { role: "settings" }, shortcut: "Cmd+," },
      { type: "action", id: "updates", label: "Check for Updates…", disabled: __DEV__ || !status.available },
    ] },
    { type: "submenu", id: "view", label: "View", items: [{ type: "action", id: "sidebar", label: "Toggle Sidebar" }, { type: "action", id: "filmstrip", label: "Toggle Filmstrip" }] },
  ], onAction(event) {
    if (event.itemId === "settings") state$.showSettings.set(true);
    if (event.itemId === "updates") void checkForUpdates().catch(console.error);
    if (event.itemId === "sidebar") settings$.state.isSidebarOpen.toggle();
    if (event.itemId === "filmstrip") settings$.state.showFilmstrip.toggle();
  } });
}
