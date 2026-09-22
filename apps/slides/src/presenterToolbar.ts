import { displayKey, type DisplayRoles } from "./displayRoles";
export const presenterAppearanceToolbarItemId = "slides-presenter-appearance";
import type { Display, WindowToolbarItem } from "@legend-apps/window-manager";

export const presenterEditToolbarItemId = "slides-presenter-edit";
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
  displayRoles,
  displays,
  elapsed,
  hasDeck,
  canEditDeck = hasDeck,
  backgroundIntensity = 1,
  rehearsalEnabled,
  selectedDisplayId,
  timerRunning,
}: {
  audienceOpen: boolean;
  displayRoles?: DisplayRoles;
  displays: readonly Pick<Display, "id" | "name" | "persistentId">[];
  elapsed: number;
  hasDeck: boolean;
  canEditDeck?: boolean;
  backgroundIntensity?: number;
  rehearsalEnabled: boolean;
  selectedDisplayId: string | null;
  timerRunning: boolean;
}): WindowToolbarItem[] {
  const selectedDisplay = displays.length === 1 ? displays[0] : displays.find((display) => display.id === selectedDisplayId);
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
      enabled: !audienceOpen && canEditDeck,
      id: presenterEditToolbarItemId,
      label: "Edit Source",
      placement: "trailing",
      systemImageName: "square.and.pencil",
      tooltip: "Edit Source",
      type: "button",
    },
    {
      id: presenterAppearanceToolbarItemId,
      label: "",
      width: 36,
      placement: "trailing",
      systemImageName: "sun.max",
      tooltip: "Appearance",
      type: "menuButton",
      menuItems: [
        { label: "Background intensity", value: "background-intensity",
          slider: { min: 0, max: 100, value: Math.round(backgroundIntensity / 6 * 100), suffix: "%" } },
      ],
    },
    {
      enabled: !audienceOpen,
      id: presenterModeToolbarItemId,
      label: "",
      width: 36,
      menuItems: modeMenuItems,
      placement: "trailing",
      systemImageName: rehearsalEnabled ? "figure.run" : "play.rectangle",
      tooltip: rehearsalEnabled ? "Rehearsal mode" : "Presentation mode",
      type: "menuButton",
    },
    {
      enabled: true,
      id: presenterDisplayToolbarItemId,
      label: "",
      width: 36,
      menuItems: displays.length <= 1 ? [
        { label: audienceOpen ? "Close Audience Window" : "Open Audience Window", value: audienceOpen ? "close-audience" : "open-audience", enabled: audienceOpen || (hasDeck && displays.length === 1) },
        { label: "Preview Notes Screen", value: "preview-notes", enabled: hasDeck },
      ] : [
        ...displays.flatMap((display, index) => {
          const key = displayKey(display);
          const roles = displayRoles ?? { audience: selectedDisplayId, notes: null };
          const role = roles.audience === key || roles.audience === display.id ? "audience" : roles.notes === key || roles.notes === display.id ? "notes" : "unused";
          return [
            { label: `${index + 1}. ${display.name} — ${role === "unused" ? "Unused" : role === "audience" ? "Audience" : "Notes"}`, enabled: false },
            ...(["audience", "notes", "unused"] as const).map(value => ({
              label: value === "audience" ? "Use for Audience" : value === "notes" ? "Use for Notes" : "Unused",
              selected: role === value, value: `role:${value}:${display.id}`,
            })),
            { separator: true },
          ];
        }),
        { label: "Identify Displays", value: "identify-displays" },
        { label: "Preview Notes Screen", value: "preview-notes" },
      ],
      placement: "trailing",
      systemImageName: "display",
      tooltip: displays.length <= 1 ? "Presentation windows" : "Assign display roles",
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
