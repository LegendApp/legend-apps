import { useEffect, useSyncExternalStore } from "react";
import { getMusicSettingsSnapshot, loadMusicSettings, subscribeMusicSettings } from "./settingsStore";

export function useMusicSettings() {
  useEffect(() => {
    void loadMusicSettings();
  }, []);

  return useSyncExternalStore(subscribeMusicSettings, getMusicSettingsSnapshot, getMusicSettingsSnapshot);
}

