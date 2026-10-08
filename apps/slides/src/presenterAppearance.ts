export const defaultPresenterTextColor = "#d1d5db";
export const defaultPresenterInactiveColor = "#52525b";

export function normalizePresenterColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${[...color.slice(1)].map(char => char + char).join("")}`;
  return fallback;
}
