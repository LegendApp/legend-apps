import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { TransitionSettingsPage } from "./TransitionSettingsPage";
import { CompilerSettingsPage } from "./CompilerSettingsPage";
import { EffectsSettingsPage } from "./EffectsSettingsPage";
import { SelectControl } from "@legend-apps/design-system";
import {
  SettingsRow,
  SettingsSection,
  SettingsPage,
  SettingsWindow as SharedSettingsWindow,
  SettingsSwitchRow,
} from "@legendapp/spark/ui/settings";
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

function TimerSettingsPage() {
  const presentationTimerStartsOnSecondSlide = usePresentationTimerStartsOnSecondSlideSetting();
  const rehearsalTimerPausesWhileEditing = useRehearsalTimerPausesWhileEditingSetting();

  return (
    <>
      <SettingsSection title="Presentation">
        <SettingsSwitchRow
          description="Wait on the title slide, then start or restart the timer when advancing from slide 1 to slide 2."
          label="Start Timer on Slide 2"
          value={presentationTimerStartsOnSecondSlide}
          onValueChange={setPresentationTimerStartsOnSecondSlideSetting}
        />
      </SettingsSection>
      <SettingsSection title="Rehearsal">
        <SettingsSwitchRow
          description="Pause when speaker-note editing begins and continue on the next slide navigation."
          label="Pause Timer While Editing Notes"
          value={rehearsalTimerPausesWhileEditing}
          onValueChange={setRehearsalTimerPausesWhileEditingSetting}
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
  return <SettingsSection>
    <SettingsRow label="Presentation Notes Width" description="Maximum width of the centered notes column.">
      <SelectControl accessibilityLabel="Presentation notes width" value={width} onChange={setPresentationNotesWidthSetting}
      options={[600, 800, 1000, 1200, 1600, 2400].map(value => ({ value, label: `${value} pt` }))} />
    </SettingsRow>
    <SettingsRow label="Presentation Notes Font Size" description="Text size in the notes viewer and editor (12–40 pt).">
      <NotesFontSizeInput key={fontSize} value={fontSize} />
    </SettingsRow>
    <SettingsRow label="Presenter Text Color" description="Text color for the current step and notes without a step number.">
      <PresenterColorInput key={textColor} label="Presenter text color" value={textColor} onChange={setPresenterTextColorSetting} />
    </SettingsRow>
    <SettingsRow label="Presenter Inactive Color" description="Text color for notes belonging to other steps.">
      <PresenterColorInput key={inactiveColor} label="Presenter inactive color" value={inactiveColor} onChange={setPresenterInactiveColorSetting} />
    </SettingsRow>
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

export function SettingsWindow() {
  return (
    <SharedSettingsWindow
      appearance="dark"
      windowId={slidesSettingsWindowIdentifier}
    >
      <SettingsPage id="appearance" title="Appearance" icon="paintbrush">
        <AppearanceSettingsContent />
      </SettingsPage>
      <SettingsPage id="timer" title="Timer" icon="timer">
        <TimerSettingsPage />
      </SettingsPage>
      <SettingsPage id="transitions" title="Transitions" icon="rectangle.on.rectangle">
        <TransitionSettingsPage />
      </SettingsPage>
      <SettingsPage id="effects" title="Effects" heading="Effect Packs" icon="wand.and.stars">
        <EffectsSettingsPage />
      </SettingsPage>
      <SettingsPage id="compiler" title="Compiler" heading="Deck Compiler" icon="hammer">
        <CompilerSettingsPage />
      </SettingsPage>
    </SharedSettingsWindow>
  );
}

export default SettingsWindow;
