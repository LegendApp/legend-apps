import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { TransitionSettingsPage } from "./TransitionSettingsPage";
import { CompilerSettingsPage } from "./CompilerSettingsPage";
import { EffectsSettingsPage } from "./EffectsSettingsPage";
import { SelectControl, SwitchControl } from "@legend-apps/design-system";
import {
  SettingsRow,
  SettingsSection,
  SettingsPage,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legendapp/spark/settings/window";
import {
  usePresentationNotesFontSizeSetting,
  setPresentationNotesFontSizeSetting,
  usePresentationNotesWidthSetting,
  setPresentationNotesWidthSetting,
  setPresentationTimerStartsOnSecondSlideSetting,
  setRehearsalTimerPausesWhileEditingSetting,
  usePresentationTimerStartsOnSecondSlideSetting,
  useRehearsalTimerPausesWhileEditingSetting,
  usePresenterTextColorSetting,
  setPresenterTextColorSetting,
  usePresenterInactiveColorSetting,
  setPresenterInactiveColorSetting,
} from "./slidesSettings";
import { normalizePresenterColor } from "./presenterAppearance";
import { slidesSettingsWindowIdentifier } from "./slidesWindows";

type SlidesSettingsPage = "appearance" | "timer" | "transitions" | "effects" | "compiler";

function TimerSettingsPage() {
  const presentationTimerStartsOnSecondSlide = usePresentationTimerStartsOnSecondSlideSetting();
  const rehearsalTimerPausesWhileEditing = useRehearsalTimerPausesWhileEditingSetting();

  return (
    <>
      <SettingsSection first title="Presentation">
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Start timer on slide 2"
              checked={presentationTimerStartsOnSecondSlide}
              onChange={setPresentationTimerStartsOnSecondSlideSetting}
            />
          )}
          description="Wait on the title slide, then start or restart the timer when advancing from slide 1 to slide 2."
          title="Start Timer on Slide 2"
        />
      </SettingsSection>
      <SettingsSection title="Rehearsal">
        <SettingsRow
          align="center"
          control={(
            <SwitchControl
              accessibilityLabel="Pause timer while editing notes"
              checked={rehearsalTimerPausesWhileEditing}
              onChange={setRehearsalTimerPausesWhileEditingSetting}
            />
          )}
          description="Pause when speaker-note editing begins and continue on the next slide navigation."
          title="Pause Timer While Editing Notes"
        />
      </SettingsSection>
    </>
  );
}

function NotesFontSizeInput({ value }: { value: number }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const parsed = Number(draft.trim());
    const next = draft.trim() && Number.isFinite(parsed) ? Math.max(12, Math.min(40, Math.round(parsed))) : value;
    setDraft(String(next));
    setPresentationNotesFontSizeSetting(next);
  };
  return <TextInput accessibilityLabel="Presentation notes font size" inputMode="numeric"
    value={draft} onChangeText={setDraft} onEndEditing={commit} onSubmitEditing={commit}
    selectTextOnFocus className="h-8 w-24 rounded-md border border-border-primary bg-background-primary px-2 text-sm text-foreground" />;
}

function AppearanceSettingsContent() {
  const width = usePresentationNotesWidthSetting();
  const fontSize = usePresentationNotesFontSizeSetting();
  const textColor = usePresenterTextColorSetting();
  const inactiveColor = usePresenterInactiveColorSetting();
  return <SettingsSection first title={null}>
    <SettingsRow title="Presentation Notes Width" description="Maximum width of the centered notes column."
      control={<SelectControl accessibilityLabel="Presentation notes width" value={width} onChange={setPresentationNotesWidthSetting}
        options={[600, 800, 1000, 1200, 1600, 2400].map(value => ({ value, label: `${value} pt` }))} />} />
    <SettingsRow title="Presentation Notes Font Size" description="Text size in the notes viewer and editor (12–40 pt)."
      control={<NotesFontSizeInput key={fontSize} value={fontSize} />} />
    <SettingsRow title="Presenter Text Color" description="Text color for the current step and notes without a step number."
      control={<PresenterColorInput key={textColor} label="Presenter text color" value={textColor} onChange={setPresenterTextColorSetting} />} />
    <SettingsRow title="Presenter Inactive Color" description="Text color for notes belonging to other steps."
      control={<PresenterColorInput key={inactiveColor} label="Presenter inactive color" value={inactiveColor} onChange={setPresenterInactiveColorSetting} />} />
  </SettingsSection>;
}

function PresenterColorInput({ label, value, onChange }: { label: string; value: string; onChange(color: string): void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const color = normalizePresenterColor(draft, value);
    setDraft(color);
    onChange(color);
  };
  return <View className="flex-row items-center gap-2">
    <View className="h-5 w-5 rounded border border-border-primary" style={{ backgroundColor: normalizePresenterColor(draft, value) }} />
    <TextInput accessibilityLabel={label} value={draft} onChangeText={setDraft} onEndEditing={commit} onSubmitEditing={commit}
      autoCapitalize="none" autoCorrect={false} selectTextOnFocus
      className="h-8 w-28 rounded-md border border-border-primary bg-background-primary px-2 text-sm text-foreground" />
  </View>;
}

const pageContent: SettingsWindowPage<SlidesSettingsPage>[] = [{
  id: "appearance", title: "Appearance", render: () => <AppearanceSettingsContent />,
}, {
  id: "timer",
  render: () => <TimerSettingsPage />,
  title: "Timer",
}, { id: "transitions", title: "Transitions", render: () => <TransitionSettingsPage /> },
  { id: "effects", title: "Effects", render: () => <EffectsSettingsPage /> },
  { id: "compiler", title: "Compiler", render: () => <CompilerSettingsPage /> }];
const pages = pageContent.map(page => ({ ...page, render: () => <SettingsPage key={page.id}><Text className="mb-5 text-xl font-semibold text-text-primary">{page.title}</Text>{page.render()}</SettingsPage> }));

export function SettingsWindow() {
  return (
    <SharedSettingsWindow
      appearance="dark"
      pages={pages}
      windowId={slidesSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
