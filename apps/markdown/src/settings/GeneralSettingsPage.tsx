import { RadioOption } from "@legend-desktop/design-system";
import { SettingsPage, SettingsSection } from "@legend-desktop/settings-window";
import { View } from "react-native";
import {
  setMarkdownAutosaveSetting,
  setMarkdownStartupBehaviorSetting,
  setMarkdownFormattingToolbarModeSetting,
  type MarkdownAutosaveSetting,
  type MarkdownFormattingToolbarModeSetting,
  type MarkdownStartupBehaviorSetting,
  useMarkdownAutosaveSetting,
  useMarkdownFormattingToolbarModeSetting,
  useMarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { ToolbarLayoutEditor } from "./ToolbarLayoutEditor";

export function GeneralSettingsPage() {
  const startupBehavior = useMarkdownStartupBehaviorSetting();
  const autosave = useMarkdownAutosaveSetting();
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();

  return (
    <SettingsPage>
      <SettingsSection card={false} first title="On Startup">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownStartupBehaviorSetting>
            label="New Document"
            onSelect={setMarkdownStartupBehaviorSetting}
            selected={startupBehavior === "newDocument"}
            value="newDocument"
          />
          <RadioOption<MarkdownStartupBehaviorSetting>
            label="Last Document"
            onSelect={setMarkdownStartupBehaviorSetting}
            selected={startupBehavior === "lastDocument"}
            value="lastDocument"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Autosave">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownAutosaveSetting>
            label="Enabled"
            onSelect={setMarkdownAutosaveSetting}
            selected={autosave === "enabled"}
            value="enabled"
          />
          <RadioOption<MarkdownAutosaveSetting>
            label="Disabled"
            onSelect={setMarkdownAutosaveSetting}
            selected={autosave === "disabled"}
            value="disabled"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Formatting Toolbar">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Above Selection"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "selection"}
            value="selection"
          />
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Top Toolbar"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "top"}
            value="top"
          />
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Hidden"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "hidden"}
            value="hidden"
          />
        </View>
        <ToolbarLayoutEditor
          description="Choose the controls and order used by the top toolbar."
          layoutId="top"
          title="Top Toolbar"
        />
        <ToolbarLayoutEditor
          description="Choose the controls and order used by the floating toolbar above selected text."
          layoutId="selection"
          title="Floating Toolbar"
        />
      </SettingsSection>
    </SettingsPage>
  );
}
