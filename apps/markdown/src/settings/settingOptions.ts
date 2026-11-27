import type {
  MarkdownContentWidthSetting,
  MarkdownDocumentDensitySetting,
  MarkdownFontFamilySetting,
  MarkdownFontSizeSetting,
  MarkdownFormattingToolbarModeSetting,
  MarkdownLineHeightSetting,
} from "../markdownSettings";

/** The choices and labels the Settings window and the Assistant show for each preference. */
export const fontFamilyOptions = [
  { label: "Theme", value: "system" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "mono" },
] as const satisfies readonly { label: string; value: MarkdownFontFamilySetting }[];

export const fontSizeOptions = [
  { label: "Small", value: "small" },
  { label: "Default", value: "default" },
  { label: "Large", value: "large" },
  { label: "XL", value: "xlarge" },
] as const satisfies readonly { label: string; value: MarkdownFontSizeSetting }[];

export const lineHeightOptions = [
  { label: "Compact", value: "compact" },
  { label: "Normal", value: "normal" },
  { label: "Relaxed", value: "relaxed" },
] as const satisfies readonly { label: string; value: MarkdownLineHeightSetting }[];

export const contentWidthOptions = [
  { label: "Narrow", value: "narrow" },
  { label: "Standard", value: "standard" },
  { label: "Wide", value: "wide" },
  { label: "Full", value: "full" },
] as const satisfies readonly { label: string; value: MarkdownContentWidthSetting }[];

export const densityOptions = [
  { label: "Compact", value: "compact" },
  { label: "Comfortable", value: "comfortable" },
  { label: "Spacious", value: "spacious" },
] as const satisfies readonly { label: string; value: MarkdownDocumentDensitySetting }[];

export const formattingToolbarModeOptions = [
  { label: "Floating", value: "selection" },
  { label: "Top", value: "top" },
  { label: "Bottom", value: "bottom" },
  { label: "Hidden", value: "hidden" },
] as const satisfies readonly { label: string; value: MarkdownFormattingToolbarModeSetting }[];
