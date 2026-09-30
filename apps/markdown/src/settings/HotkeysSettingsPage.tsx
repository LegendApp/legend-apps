import {
  HotkeyBindingsSettingsContent as SharedHotkeysSettingsContent,
  HotkeyBindingsSettingsPage as SharedHotkeysSettingsPage,
} from "@legendapp/spark/shortcuts/commands";
import { markdownHotkeyDefinitions } from "../markdownHotkeys";
import {
  setMarkdownHotkeySetting,
  useMarkdownHotkeySettings,
} from "../markdownSettings";

export function HotkeysSettingsPage() {
  const hotkeys = useMarkdownHotkeySettings();

  return (
    <SharedHotkeysSettingsPage
      maxBindingsPerCommand={1}
      definitions={markdownHotkeyDefinitions}
      onChange={setMarkdownHotkeySetting}
      values={hotkeys}
    />
  );
}

export function HotkeysSettingsContent() {
  const hotkeys = useMarkdownHotkeySettings();

  return (
    <SharedHotkeysSettingsContent
      maxBindingsPerCommand={1}
      definitions={markdownHotkeyDefinitions}
      onChange={setMarkdownHotkeySetting}
      showTitle={false}
      values={hotkeys}
    />
  );
}
