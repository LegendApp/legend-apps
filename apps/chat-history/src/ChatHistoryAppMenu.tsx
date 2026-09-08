import { AutoUpdater } from "@legend-apps/auto-updater";
import { useNativeMenu, type NativeMenuConfig } from "@legend-apps/native-menu";
import { useEffect, useMemo } from "react";

function reportUpdateError(error: unknown) {
  console.error(`[ChatHistoryUpdater] ${error instanceof Error ? error.message : String(error)}`);
}

const menuHandlers = {
  checkForUpdates: () => {
    if (!__DEV__ && AutoUpdater.isAvailable()) {
      AutoUpdater.checkForUpdates().catch(reportUpdateError);
    }
  },
};

export function ChatHistoryAppMenu() {
  // Only release builds include the Sparkle feed and signing metadata.
  const updatesAvailable = !__DEV__ && AutoUpdater.isAvailable();
  const menus = useMemo<NativeMenuConfig[]>(() => [{
    id: "app",
    title: "Legend Chat History",
    systemMenu: "app",
    items: [{
      id: "checkForUpdates",
      title: "Check for Updates…",
      enabled: updatesAvailable,
      placement: { after: "About Legend Chat History" },
    }],
  }], [updatesAvailable]);

  useNativeMenu({ handlers: menuHandlers, menus, ownerId: "chat-history" });

  useEffect(() => {
    if (updatesAvailable) {
      async function configureUpdates() {
        await AutoUpdater.setUpdateCheckInterval(60 * 60 * 24);
        await AutoUpdater.setAutomaticallyChecksForUpdates(true);
      }
      configureUpdates().catch(reportUpdateError);
    }
  }, [updatesAvailable]);

  return null;
}
