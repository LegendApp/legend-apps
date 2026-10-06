import { getUpdateStatus, configureUpdates, startUpdates, checkForUpdates } from "@legendapp/spark/updates";
import { useMenu, type MenuRootItem } from "@legendapp/spark/menus";
import { useEffect, useMemo, useState } from "react";
function reportUpdateError(error: unknown) { console.error(`[ChatHistoryUpdater] ${String(error)}`); }
export function ChatHistoryAppMenu() {
  const [updatesAvailable, setUpdatesAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (!__DEV__) void getUpdateStatus().then(async status => {
      if (!active || !status.available) return;
      await configureUpdates({ automaticallyChecks: true, checkIntervalSeconds: 86400 });
      if (!active) return;
      await startUpdates();
      if (active) setUpdatesAvailable(true);
    }).catch(reportUpdateError);
    return () => { active = false; };
  }, []);
  const items = useMemo<MenuRootItem[]>(() => [{ type: "submenu", id: "app", label: "Legend Chat History", target: { menu: "app" },
    items: [{ type: "action", id: "checkForUpdates", label: "Check for Updates…", disabled: !updatesAvailable, placement: { after: { role: "about" } } }],
  }], [updatesAvailable]);
  useMenu({ id: "chat-history", items, onError: reportUpdateError, onAction: action => {
    if (updatesAvailable && action.itemId === "checkForUpdates") void checkForUpdates().catch(reportUpdateError);
  } });
  return null;
}
