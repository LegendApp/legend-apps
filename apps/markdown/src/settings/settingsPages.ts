export type SettingsPage = "general" | "appearance";

export function isSettingsPage(value: string): value is SettingsPage {
  return value === "general" || value === "appearance";
}
