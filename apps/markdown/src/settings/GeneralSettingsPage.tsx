import {
  SettingsSection,
  SettingsSegmentedRow,
  SettingsSelectRow,
  SettingsSwitchRow,
} from "@legendapp/spark/ui/settings";
import {
  setMarkdownAutosaveSetting,
  setMarkdownStartupBehaviorSetting,
  setMarkdownFormattingToolbarModeSetting,
  type MarkdownFormattingToolbarModeSetting,
  type MarkdownStartupBehaviorSetting,
  useMarkdownAutosaveSetting,
  useMarkdownFormattingToolbarModeSetting,
  useMarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { ToolbarLayoutEditor } from "./ToolbarLayoutEditor";

const startupBehaviorOptions = [
  { label: "New", value: "newDocument" },
  { label: "Last", value: "lastDocument" },
] as const satisfies readonly { label: string; value: MarkdownStartupBehaviorSetting }[];

const formattingToolbarModeOptions = [
  { label: "Floating", value: "selection" },
  { label: "Top", value: "top" },
  { label: "Bottom", value: "bottom" },
  { label: "Hidden", value: "hidden" },
] as const satisfies readonly { label: string; value: MarkdownFormattingToolbarModeSetting }[];

export function GeneralSettingsContent() {
  const startupBehavior = useMarkdownStartupBehaviorSetting();
  const autosave = useMarkdownAutosaveSetting();
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();

  return (
    <>
      <SettingsSection title="Editor">
        <SettingsSegmentedRow
          description="Choose the document that appears when Markdown starts."
          label="Startup"
          options={startupBehaviorOptions}
          value={startupBehavior}
          onValueChange={value => setMarkdownStartupBehaviorSetting(value as MarkdownStartupBehaviorSetting)}
        />
        <SettingsSwitchRow
          description="Save file-backed documents automatically while you edit."
          label="Autosave"
          value={autosave === "enabled"}
          onValueChange={(checked) => setMarkdownAutosaveSetting(checked ? "enabled" : "disabled")}
        />
        <SettingsSelectRow
          description="Pick where formatting controls appear while editing."
          label="Formatting Toolbar"
          options={formattingToolbarModeOptions}
          value={formattingToolbarMode}
          onValueChange={value => setMarkdownFormattingToolbarModeSetting(value as MarkdownFormattingToolbarModeSetting)}
        />
      </SettingsSection>
      <SettingsSection title="Toolbar Layout">
        <ToolbarLayoutEditor
          description="Choose the controls and order used by the top and bottom toolbars."
          layoutId="top"
          title="Top and Bottom Toolbars"
        />
        <ToolbarLayoutEditor
          description="Choose the controls and order used by the floating toolbar above selected text."
          layoutId="selection"
          title="Floating Toolbar"
        />
      </SettingsSection>
    </>
  );
}
