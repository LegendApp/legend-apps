import { displayKey, type DisplayRoles } from "./displayRoles";
export const presenterAppearanceToolbarItemId = "slides-presenter-appearance";
import type { DisplayInfo, MacOSToolbarItem } from "@legendapp/spark/windows";

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

import type { MenuItem } from "@legendapp/spark/menus";
export function createPresenterToolbarItems({ audienceOpen, displayRoles, displays, elapsed, hasDeck, canEditDeck = hasDeck,
 backgroundIntensity = 1, rehearsalEnabled, selectedDisplayId, timerRunning }: {
 audienceOpen: boolean; displayRoles?: DisplayRoles; displays: readonly Pick<DisplayInfo, "id" | "name" | "persistentId">[];
 elapsed: number; hasDeck: boolean; canEditDeck?: boolean; backgroundIntensity?: number; rehearsalEnabled: boolean;
 selectedDisplayId: string | null; timerRunning: boolean;
}): MacOSToolbarItem[] {
 const action = (id: string, label: string, disabled = false): MenuItem => ({ type: "action", id, label, disabled });
 const displayItems: MenuItem[] = displays.length <= 1 ? [
  action(audienceOpen ? "close-audience" : "open-audience", audienceOpen ? "Close Audience Window" : "Open Audience Window", !(audienceOpen || (hasDeck && displays.length === 1))),
  action("preview-notes", "Preview Notes Screen", !hasDeck),
 ] : [
  ...displays.flatMap((display, index): MenuItem[] => {
   const key = displayKey(display), roles = displayRoles ?? { audience: selectedDisplayId, notes: null };
   const role = roles.audience === key || roles.audience === display.id ? "audience" : roles.notes === key || roles.notes === display.id ? "notes" : "unused";
   return [action(`display:${display.id}`, `${index + 1}. ${display.name} — ${role === "unused" ? "Unused" : role === "audience" ? "Audience" : "Notes"}`, true),
    ...(["audience", "notes", "unused"] as const).map((value): MenuItem => ({ type: "checkbox", id: `role:${value}:${display.id}`, label: value === "audience" ? "Use for Audience" : value === "notes" ? "Use for Notes" : "Unused", checked: role === value })), { type: "separator" }];
  }), action("identify-displays", "Identify Displays"), action("preview-notes", "Preview Notes Screen")
 ];
 return [
  { type: "menu", id: presenterElapsedToolbarItemId, label: formatPresenterElapsed(elapsed), disabled: !audienceOpen, placement: "trailing", width: 76, tooltip: "Elapsed time", items: [action(timerRunning ? presenterTimerPauseValue : presenterTimerResumeValue, timerRunning ? "Pause Timer" : "Resume Timer"), action(presenterTimerRestartValue, "Restart Timer")] },
  { type: "button", id: presenterEditToolbarItemId, label: "Edit Source", placement: "trailing", symbol: "square.and.pencil", disabled: audienceOpen || !canEditDeck, tooltip: "Edit Source" },
  { type: "menu", id: presenterAppearanceToolbarItemId, width: 36, placement: "trailing", symbol: "sun.max", tooltip: "Appearance", items: [{ type: "slider", id: "background-intensity", label: "Background intensity", min: 0, max: 100, value: Math.round(backgroundIntensity / 6 * 100), suffix: "%" }] },
  { type: "menu", id: presenterModeToolbarItemId, width: 36, placement: "trailing", disabled: audienceOpen, symbol: rehearsalEnabled ? "figure.run" : "play.rectangle", tooltip: rehearsalEnabled ? "Rehearsal mode" : "Presentation mode", items: [{ type: "checkbox", id: presenterModePresentationValue, label: "Presentation", checked: !rehearsalEnabled }, { type: "checkbox", id: presenterModeRehearsalValue, label: "Rehearsal", checked: rehearsalEnabled }] },
  { type: "menu", id: presenterDisplayToolbarItemId, width: 36, placement: "trailing", symbol: "display", tooltip: displays.length <= 1 ? "Presentation windows" : "Assign display roles", items: displayItems },
  { type: "button", id: presenterStartToolbarItemId, label: audienceOpen ? "Stop" : rehearsalEnabled ? "Start Rehearsal" : "Start Presentation", placement: "trailing", symbol: audienceOpen ? "stop.fill" : "play.fill", disabled: !(audienceOpen || (hasDeck && (displays.length === 1 || displays.some(display => display.id === selectedDisplayId)))) },
 ];
}
