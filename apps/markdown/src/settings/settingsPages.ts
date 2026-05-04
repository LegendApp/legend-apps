export type SettingsPage = "general" | "appearance";

export const settingsPages: { id: SettingsPage; title: string }[] = [
  { id: "general", title: "General" },
  { id: "appearance", title: "Appearance" },
];

export const sidebarItems = settingsPages.map((page) => ({
  id: page.id,
  title: page.title,
}));

export function isSettingsPage(value: string): value is SettingsPage {
  return value === "general" || value === "appearance";
}

export function getSettingsPageTitle(pageId: SettingsPage) {
  return settingsPages.find((page) => page.id === pageId)?.title ?? "Settings";
}
