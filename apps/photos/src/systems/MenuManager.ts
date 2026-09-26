import { configureMenus, addNativeMenuActionListener, commandModifier } from "@legendapp/spark/menus";
import { checkForUpdates, AutoUpdater } from "@legendapp/spark/updates";
import { settings$ } from "../settings/SettingsFile";
import { state$ } from "./State";
export function initializeMenuManager() {
  configureMenus("photos", [
    {id: "app", title: "Legend Photos", systemMenu: "app", items: [
      {id: "settings", title: "Settings…", targetTitles: ["Settings…", "Settings...", "Preferences…", "Preferences..."], shortcut: {key: ",", modifiers: commandModifier}},
      {id: "updates", title: "Check for Updates…", enabled: !__DEV__ && AutoUpdater.isAvailable()},
    ]},
    {id: "view", title: "View", items: [{id: "sidebar", title: "Toggle Sidebar"}, {id: "filmstrip", title: "Toggle Filmstrip"}]},
  ]);
  addNativeMenuActionListener(event => {
    if (event.ownerId !== "photos") return;
    if (event.itemId === "settings") state$.showSettings.set(true);
    if (event.itemId === "updates") void checkForUpdates();
    if (event.itemId === "sidebar") settings$.state.isSidebarOpen.toggle();
    if (event.itemId === "filmstrip") settings$.state.showFilmstrip.toggle();
  });
}
