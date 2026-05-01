import { requestAppExit } from "@legend-desktop/app-exit";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import { addGlobalHotkeyListener, registerGlobalHotkey, unregisterGlobalHotkey } from "@legend-desktop/global-hotkey";
import {
  addNativeMenuActionListener,
  clearMenus,
  configureMenus,
  updateMenuItems,
} from "@legend-desktop/native-menu";
import { showMainWindow } from "@legend-desktop/window-manager";
import { useEffect, useRef } from "react";
import type { RepeatMode } from "../domain";
import {
  setRepeatMode,
  skipNext,
  skipPrevious,
  togglePlayback,
  toggleShuffle,
} from "../playback";
import { commandModifier, getGlobalHotkeyLabel, optionModifier, shiftModifier } from "../settings";
import type { MusicSettingsState } from "../settings";
import { updateMusicSettings } from "../settings";

const ownerId = "legend-music";
const repeatModes: RepeatMode[] = ["off", "all", "one"];

type MusicDesktopIntegrationOptions = Readonly<{
  canClearLibrary: boolean;
  canRescanLibrary: boolean;
  isPlaying: boolean;
  onAddLibrary: () => void;
  onClearLibrary: () => void;
  onOpenLibraryWindow: () => void;
  onOpenSettings: () => void;
  onRescanLibrary: () => void;
  onStatus: (message: string) => void;
  onToggleQueue: () => void;
  queueVisible: boolean;
  repeatMode: RepeatMode;
  settings: MusicSettingsState;
  shuffleEnabled: boolean;
}>;

export function useMusicDesktopIntegrations(options: MusicDesktopIntegrationOptions) {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    configureMenus(ownerId, [
      {
        id: "file",
        title: "File",
        placement: { before: "Window" },
        items: [
          { id: "addLibrary", title: "Add Library...", shortcut: { key: "o", modifiers: commandModifier } },
          { id: "rescanLibrary", title: "Rescan Library", shortcut: { key: "r", modifiers: commandModifier } },
          { id: "clearLibrary", title: "Clear Library" },
          { separator: true, id: "fileSeparator" },
          { id: "openLibraryWindow", title: "Open Library Window" },
          { id: "openSettings", title: "Settings..." },
          { separator: true, id: "windowSeparator" },
          { id: "quit", title: "Quit Legend Music", shortcut: { key: "q", modifiers: commandModifier } },
        ],
      },
      {
        id: "playback",
        title: "Playback",
        placement: { before: "Window" },
        items: [
          { id: "playPause", title: "Play", shortcut: { key: "p", modifiers: commandModifier } },
          { id: "previous", title: "Previous Track", shortcut: { key: "[", modifiers: commandModifier } },
          { id: "next", title: "Next Track", shortcut: { key: "]", modifiers: commandModifier } },
          { separator: true, id: "playbackSeparator" },
          { id: "shuffle", title: "Shuffle", shortcut: { key: "s", modifiers: optionModifier } },
          { id: "repeat", title: "Repeat: Off", shortcut: { key: "r", modifiers: optionModifier } },
        ],
      },
      {
        id: "library",
        title: "Library",
        placement: { before: "Window" },
        items: [
          { id: "toggleQueue", title: "Hide Queue", shortcut: { key: "j", modifiers: commandModifier | shiftModifier } },
          { id: "toggleOverlay", title: "Now Playing Overlay" },
          { id: "toggleGlobalHotkey", title: "Enable Global Hotkey" },
          { id: "toggleAutoUpdates", title: "Automatic Update Checks" },
          { separator: true, id: "librarySeparator" },
          { id: "checkForUpdates", title: "Check for Updates..." },
        ],
      },
    ]);

    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== ownerId) {
        return;
      }

      const latest = optionsRef.current;
      if (action.itemId === "addLibrary") {
        latest.onAddLibrary();
      } else if (action.itemId === "rescanLibrary") {
        latest.onRescanLibrary();
      } else if (action.itemId === "clearLibrary") {
        latest.onClearLibrary();
      } else if (action.itemId === "openLibraryWindow") {
        latest.onOpenLibraryWindow();
      } else if (action.itemId === "openSettings") {
        latest.onOpenSettings();
      } else if (action.itemId === "quit") {
        requestAppExit();
      } else if (action.itemId === "playPause") {
        void togglePlayback();
      } else if (action.itemId === "previous") {
        void skipPrevious();
      } else if (action.itemId === "next") {
        void skipNext();
      } else if (action.itemId === "shuffle") {
        toggleShuffle();
      } else if (action.itemId === "repeat") {
        cycleRepeatMode(latest.repeatMode);
      } else if (action.itemId === "toggleQueue") {
        latest.onToggleQueue();
      } else if (action.itemId === "toggleOverlay") {
        void updateMusicSettings({ general: { nowPlayingOverlayEnabled: !latest.settings.general.nowPlayingOverlayEnabled } });
      } else if (action.itemId === "toggleGlobalHotkey") {
        void updateMusicSettings({ general: { globalHotkeyEnabled: !latest.settings.general.globalHotkeyEnabled } });
      } else if (action.itemId === "toggleAutoUpdates") {
        void updateMusicSettings({ general: { autoCheckForUpdates: !latest.settings.general.autoCheckForUpdates } });
      } else if (action.itemId === "checkForUpdates") {
        void checkForUpdates(latest.onStatus);
      }
    });

    return () => {
      subscription.remove();
      clearMenus(ownerId);
    };
  }, []);

  useEffect(() => {
    updateMenuItems(ownerId, [
      { id: "clearLibrary", enabled: options.canClearLibrary },
      { id: "rescanLibrary", enabled: options.canRescanLibrary },
      { id: "playPause", title: options.isPlaying ? "Pause" : "Play" },
      { id: "shuffle", checked: options.shuffleEnabled },
      { id: "repeat", checked: options.repeatMode !== "off", title: `Repeat: ${formatRepeatMode(options.repeatMode)}` },
      { id: "toggleQueue", title: options.queueVisible ? "Hide Queue" : "Show Queue" },
      {
        checked: options.settings.general.nowPlayingOverlayEnabled,
        id: "toggleOverlay",
      },
      {
        checked: options.settings.general.globalHotkeyEnabled,
        id: "toggleGlobalHotkey",
        title: options.settings.general.globalHotkeyEnabled ? "Disable Global Hotkey" : "Enable Global Hotkey",
      },
      {
        checked: options.settings.general.autoCheckForUpdates,
        id: "toggleAutoUpdates",
      },
    ]);
  }, [
    options.canClearLibrary,
    options.canRescanLibrary,
    options.isPlaying,
    options.queueVisible,
    options.repeatMode,
    options.settings.general.autoCheckForUpdates,
    options.settings.general.globalHotkeyEnabled,
    options.settings.general.nowPlayingOverlayEnabled,
    options.shuffleEnabled,
  ]);

  useEffect(() => {
    if (!options.settings.loaded) {
      return;
    }

    if (!options.settings.general.globalHotkeyEnabled) {
      void unregisterGlobalHotkey();
      return;
    }

    const { keyCode, modifiers } = options.settings.general.globalHotkey;
    void registerGlobalHotkey(keyCode, modifiers).then((result) => {
      if (!result.success) {
        const label = getGlobalHotkeyLabel(optionsRef.current.settings.general.globalHotkey);
        optionsRef.current.onStatus(result.message ?? `Failed to register global hotkey ${label}.`);
      }
    });

    const subscription = addGlobalHotkeyListener(() => {
      void showMainWindow();
    });

    return () => {
      subscription.remove();
      void unregisterGlobalHotkey();
    };
  }, [
    options.settings.general.globalHotkey.keyCode,
    options.settings.general.globalHotkey.modifiers,
    options.settings.general.globalHotkeyEnabled,
    options.settings.loaded,
  ]);

  useEffect(() => {
    if (!options.settings.loaded) {
      return;
    }

    void AutoUpdater.setAutomaticallyChecksForUpdates(options.settings.general.autoCheckForUpdates);
    if (options.settings.general.autoCheckForUpdates) {
      void AutoUpdater.checkForUpdatesInBackground();
    }
  }, [options.settings.general.autoCheckForUpdates, options.settings.loaded]);
}

function cycleRepeatMode(current: RepeatMode) {
  const index = repeatModes.indexOf(current);
  setRepeatMode(repeatModes[(index + 1) % repeatModes.length]);
}

async function checkForUpdates(onStatus: (message: string) => void) {
  const available = await AutoUpdater.isAvailable();
  if (!available) {
    onStatus("Update checks are not available on this platform.");
    return;
  }

  const opened = await AutoUpdater.checkForUpdates();
  onStatus(opened ? "Checking for updates..." : "Could not start update check.");
}

function formatRepeatMode(repeatMode: RepeatMode) {
  if (repeatMode === "all") {
    return "All";
  }
  if (repeatMode === "one") {
    return "One";
  }
  return "Off";
}
