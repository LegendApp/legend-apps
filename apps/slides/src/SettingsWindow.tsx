import { useState } from "react";
import { TextInput } from "react-native";
import { TransitionSettingsPage } from "./TransitionSettingsPage";
import { SelectControl, SwitchControl } from "@legend-apps/design-system";
import {
  SettingsRow,
  SettingsSection,
  VirtualizedSettingsWindow as SharedSettingsWindow,
  type VirtualizedSettingsWindowPage,
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
} from "./slidesSettings";
import { slidesSettingsWindowIdentifier } from "./slidesWindows";

type SlidesSettingsPage = "appearance" | "timer" | "transitions";

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
  return <SettingsSection first title={null}>
    <SettingsRow title="Presentation Notes Width" description="Maximum width of the centered notes column."
      control={<SelectControl accessibilityLabel="Presentation notes width" value={width} onChange={setPresentationNotesWidthSetting}
        options={[600, 800, 1000, 1200, 1600, 2400].map(value => ({ value, label: `${value} pt` }))} />} />
    <SettingsRow title="Presentation Notes Font Size" description="Text size in the notes viewer and editor (12–40 pt)."
      control={<NotesFontSizeInput key={fontSize} value={fontSize} />} />
  </SettingsSection>;
}

const pages: VirtualizedSettingsWindowPage<SlidesSettingsPage>[] = [{
  id: "appearance", title: "Appearance", renderContent: () => <AppearanceSettingsContent />,
}, {
  id: "timer",
  renderContent: () => <TimerSettingsPage />,
  title: "Timer",
}, { id: "transitions", title: "Transitions", renderContent: () => <TransitionSettingsPage /> }];

export function SettingsWindow() {
  return (
    <SharedSettingsWindow
      appearance="dark"
      pages={pages}
      windowIdentifier={slidesSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
