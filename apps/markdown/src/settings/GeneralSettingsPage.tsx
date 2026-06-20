import {
  SegmentedOptions,
  SwitchControl,
} from "@legend-desktop/design-system";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@legend-desktop/settings-window";
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

export function GeneralSettingsPage() {
  const startupBehavior = useMarkdownStartupBehaviorSetting();
  const autosave = useMarkdownAutosaveSetting();
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();

  return (
    <SettingsPage>
      <SettingsSection
        card={false}
        contentClassName="gap-3"
        description="Choose how Markdown opens documents, saves changes, and presents formatting controls."
        first
        title="Editor"
      >
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownStartupBehaviorSetting}
              options={startupBehaviorOptions}
              value={startupBehavior}
            />
          )}
          description="Choose the document that appears when Markdown starts."
          title="Startup"
        />
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Autosave"
              checked={autosave === "enabled"}
              onChange={(checked) => setMarkdownAutosaveSetting(checked ? "enabled" : "disabled")}
            />
          )}
          description="Save file-backed documents automatically while you edit."
          title="Autosave"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownFormattingToolbarModeSetting}
              options={formattingToolbarModeOptions}
              value={formattingToolbarMode}
            />
          )}
          description="Pick where formatting controls appear while editing."
          title="Formatting Toolbar"
        />
      </SettingsSection>
      <SettingsSection
        card={false}
        contentClassName="gap-6"
        description="Tune which controls are shown and the order they appear in."
        title="Toolbar Layout"
      >
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
    </SettingsPage>
  );
}
