import { HotkeysSettingsPage as SharedHotkeysSettingsPage } from "@legend-desktop/hotkeys";
import { useSyncExternalStore } from "react";
import { markdownHotkeyDefinitions } from "../markdownHotkeys";
import {
  getMarkdownHotkeySettings,
  setMarkdownHotkeySetting,
  subscribeToMarkdownSettings,
} from "../markdownSettings";

export function HotkeysSettingsPage() {
  const hotkeys = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownHotkeySettings,
    getMarkdownHotkeySettings,
  );

  return (
    <SharedHotkeysSettingsPage
      definitions={markdownHotkeyDefinitions}
      onChange={setMarkdownHotkeySetting}
      values={hotkeys}
    />
  );
}
