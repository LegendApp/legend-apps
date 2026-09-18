import type { Display, WindowToolbarItem } from "@legend-apps/window-manager";

export const presenterModeToolbarItemId = "slides-presenter-mode";
export const presenterDisplayToolbarItemId = "slides-presenter-display";
export const presenterStartToolbarItemId = "slides-presenter-start";
export const presenterElapsedToolbarItemId = "slides-presenter-elapsed";

export const presenterModePresentationValue = "presentation";
export const presenterModeRehearsalValue = "rehearsal";
export const presenterTimerPauseValue = "pause-timer";
export const presenterTimerResumeValue = "resume-timer";
export const presenterTimerRestartValue = "restart-timer";
export const presenterStartValue = "start";
export const presenterStopValue = "stop";

export function formatPresenterElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function createPresenterToolbarItems({
  audienceOpen,
  displays,
  elapsed,
  hasDeck,
  rehearsalEnabled,
  selectedDisplayId,
  timerRunning,
}: {
  audienceOpen: boolean;
  displays: readonly Pick<Display, "id" | "name">[];
  elapsed: number;
  hasDeck: boolean;
  rehearsalEnabled: boolean;
  selectedDisplayId: string | null;
  timerRunning: boolean;
}): WindowToolbarItem[] {
  const selectedDisplay = displays.find((display) => display.id === selectedDisplayId);
  const modeMenuItems = [
    {
      label: "Presentation",
      selected: !rehearsalEnabled,
      systemImageName: "play.rectangle",
      value: presenterModePresentationValue,
    },
    {
      label: "Rehearsal",
      selected: rehearsalEnabled,
      systemImageName: "figure.run",
      value: presenterModeRehearsalValue,
    },
  ];

  return [
    {
      enabled: audienceOpen,
      id: presenterElapsedToolbarItemId,
      label: formatPresenterElapsed(elapsed),
      menuItems: [
        {
          label: timerRunning ? "Pause Timer" : "Resume Timer",
          systemImageName: timerRunning ? "pause.fill" : "play.fill",
          value: timerRunning ? presenterTimerPauseValue : presenterTimerResumeValue,
        },
        {
          label: "Restart Timer",
          systemImageName: "arrow.counterclockwise",
          value: presenterTimerRestartValue,
        },
      ],
      monospacedDigits: true,
      placement: "trailing",
      tooltip: "Elapsed time",
      type: "menuButton",
      width: 76,
    },
    {
      enabled: !audienceOpen,
      id: presenterModeToolbarItemId,
      label: rehearsalEnabled ? "Rehearsal" : "Presentation",
      menuItems: modeMenuItems,
      placement: "trailing",
      systemImageName: rehearsalEnabled ? "figure.run" : "play.rectangle",
      tooltip: "Presentation mode",
      type: "menuButton",
    },
    {
      enabled: !audienceOpen && displays.length > 0,
      id: presenterDisplayToolbarItemId,
      label: selectedDisplay?.name ?? "Display",
      menuItems: displays.map((display) => ({
        label: display.name,
        selected: display.id === selectedDisplayId,
        value: display.id,
      })),
      placement: "trailing",
      systemImageName: "display",
      tooltip: selectedDisplay ? `Present on ${selectedDisplay.name}` : "Choose a presentation display",
      type: "menuButton",
    },
    {
      enabled: audienceOpen || (hasDeck && (selectedDisplay !== undefined)),
      id: presenterStartToolbarItemId,
      label: audienceOpen ? "Stop" : rehearsalEnabled ? "Start Rehearsal" : "Start Presentation",
      placement: "trailing",
      systemImageName: audienceOpen ? "stop.fill" : "play.fill",
      tooltip: audienceOpen ? "Stop" : rehearsalEnabled ? "Start Rehearsal" : "Start Presentation",
      type: "button",
      value: audienceOpen ? presenterStopValue : presenterStartValue,
    },
  ];
}
