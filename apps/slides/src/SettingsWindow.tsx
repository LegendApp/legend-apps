import { TransitionSettingsPage } from "./TransitionSettingsPage";
import { SwitchControl } from "@legend-apps/design-system";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-apps/settings-window";
import {
  setPresentationTimerStartsOnSecondSlideSetting,
  setRehearsalTimerPausesWhileEditingSetting,
  usePresentationTimerStartsOnSecondSlideSetting,
  useRehearsalTimerPausesWhileEditingSetting,
} from "./slidesSettings";
import { slidesSettingsWindowIdentifier } from "./slidesWindows";

type SlidesSettingsPage = "timer" | "transitions";

function TimerSettingsPage() {
  const presentationTimerStartsOnSecondSlide = usePresentationTimerStartsOnSecondSlideSetting();
  const rehearsalTimerPausesWhileEditing = useRehearsalTimerPausesWhileEditingSetting();

  return (
    <SettingsPage>
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
    </SettingsPage>
  );
}

const pages: SettingsWindowPage<SlidesSettingsPage>[] = [{
  id: "timer",
  render: () => <TimerSettingsPage />,
  title: "Timer",
}, { id: "transitions", title: "Transitions", render: () => <TransitionSettingsPage /> }];

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
