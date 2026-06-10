import { HotkeysSettingsPage as SharedHotkeysSettingsPage } from "@legend-desktop/hotkeys";
import { markdownHotkeyDefinitions } from "../markdownHotkeys";
import {
  setMarkdownHotkeySetting,
  useMarkdownHotkeySettings,
} from "../markdownSettings";

export function HotkeysSettingsPage() {
  const hotkeys = useMarkdownHotkeySettings();

  return (
    <SharedHotkeysSettingsPage
      definitions={markdownHotkeyDefinitions}
      onChange={setMarkdownHotkeySetting}
      values={hotkeys}
    />
  );
}
