export type SourceFontFamilySetting = typeof sourceFontFamilyOptions[number]["value"];

export const sourceFontFamilyOptions = [
  { label: "Menlo", value: "Menlo" },
  { label: "SF Mono", value: "SF Mono" },
  { label: "Monaco", value: "Monaco" },
  { label: "Courier New", value: "Courier New" },
  { label: "Courier", value: "Courier" },
] as const;

export const sourceFontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

export function normalizeSourceFontFamily(
  fontFamily: unknown,
  defaultFontFamily: SourceFontFamilySetting,
): SourceFontFamilySetting {
  return typeof fontFamily === "string" && sourceFontFamilyOptions.some((option) => option.value === fontFamily)
    ? fontFamily as SourceFontFamilySetting
    : defaultFontFamily;
}

export function normalizeSourceFontSize(fontSize: unknown, defaultFontSize: number): number {
  return typeof fontSize === "number" && sourceFontSizeOptions.includes(fontSize as typeof sourceFontSizeOptions[number])
    ? fontSize
    : defaultFontSize;
}

export function normalizeBooleanSetting(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}
