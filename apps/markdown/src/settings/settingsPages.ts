export type SettingsPage = "general" | "appearance" | "hotkeys";

export function isSettingsPage(value: string): value is SettingsPage {
  return value === "general" || value === "appearance" || value === "hotkeys";
}
