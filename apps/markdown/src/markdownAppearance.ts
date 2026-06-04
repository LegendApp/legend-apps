import type { LegendTheme } from "@legend-desktop/theme";
import type { MarkdownDocumentLayout } from "@legend-desktop/markdown-document";
import type { MarkdownStyle } from "react-native-enriched-markdown";
import type {
  MarkdownAppearanceSettings,
  MarkdownContentWidthSetting,
  MarkdownDocumentDensitySetting,
  MarkdownFontFamilySetting,
  MarkdownFontSizeSetting,
  MarkdownLineHeightSetting,
} from "./markdownSettings";

const fontFamilyBySetting: Record<MarkdownFontFamilySetting, string | undefined> = {
  mono: "Menlo",
  serif: "Georgia",
  system: undefined,
};

const bodyFontSizeBySetting: Record<MarkdownFontSizeSetting, number> = {
  default: 16,
  large: 18,
  small: 14,
  xlarge: 20,
};

const lineHeightScaleBySetting: Record<MarkdownLineHeightSetting, number> = {
  compact: 1.45,
  normal: 1.58,
  relaxed: 1.75,
};

const contentWidthBySetting: Record<MarkdownContentWidthSetting, number> = {
  full: 2000,
  narrow: 680,
  standard: 820,
  wide: 980,
};

const horizontalPaddingByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 40,
  compact: 28,
  spacious: 56,
};

const verticalPaddingByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 48,
  compact: 32,
  spacious: 64,
};

const spacingScaleByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 1,
  compact: 0.78,
  spacious: 1.22,
};

function roundedLineHeight(fontSize: number, lineHeight: MarkdownLineHeightSetting) {
  return Math.round(fontSize * lineHeightScaleBySetting[lineHeight]);
}

function scaled(value: number | undefined, scale: number) {
  return value === undefined ? undefined : Math.round(value * scale * 10) / 10;
}

function scaleBlockSpacing(layout: MarkdownDocumentLayout, density: MarkdownDocumentDensitySetting): MarkdownDocumentLayout["blockSpacing"] {
  const scale = spacingScaleByDensity[density];
  const { blockSpacing } = layout;
  const scaleSpacing = (spacing: { marginBottom?: number; marginTop?: number }) => ({
    marginBottom: scaled(spacing.marginBottom, scale),
    marginTop: scaled(spacing.marginTop, scale),
  });

  return {
    blockquote: scaleSpacing(blockSpacing.blockquote),
    codeBlock: scaleSpacing(blockSpacing.codeBlock),
    fallback: scaleSpacing(blockSpacing.fallback),
    heading: {
      1: scaleSpacing(blockSpacing.heading[1]),
      2: scaleSpacing(blockSpacing.heading[2]),
      3: scaleSpacing(blockSpacing.heading[3]),
      4: scaleSpacing(blockSpacing.heading[4]),
      5: scaleSpacing(blockSpacing.heading[5]),
      6: scaleSpacing(blockSpacing.heading[6]),
    },
    list: scaleSpacing(blockSpacing.list),
    paragraph: scaleSpacing(blockSpacing.paragraph),
    table: scaleSpacing(blockSpacing.table),
    thematicBreak: scaleSpacing(blockSpacing.thematicBreak),
  };
}

export function getMarkdownStyleForAppearance(
  theme: LegendTheme,
  settings: MarkdownAppearanceSettings,
): MarkdownStyle {
  const bodyFontSize = bodyFontSizeBySetting[settings.fontSize];
  const bodyLineHeight = roundedLineHeight(bodyFontSize, settings.lineHeight);
  const bodyFontFamily = fontFamilyBySetting[settings.fontFamily];
  const codeFontSize = Math.max(12, bodyFontSize - 2);
  const codeLineHeight = roundedLineHeight(codeFontSize, settings.lineHeight);

  return {
    ...theme.markdownStyle,
    blockquote: {
      ...theme.markdownStyle.blockquote,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize - 1,
      lineHeight: roundedLineHeight(bodyFontSize - 1, settings.lineHeight),
    },
    code: {
      ...theme.markdownStyle.code,
      fontSize: codeFontSize,
    },
    codeBlock: {
      ...theme.markdownStyle.codeBlock,
      fontSize: codeFontSize,
      lineHeight: codeLineHeight,
    },
    h1: {
      ...theme.markdownStyle.h1,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * 1.875),
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * 1.875), "compact"),
    },
    h2: {
      ...theme.markdownStyle.h2,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * 1.5),
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * 1.5), "compact"),
    },
    h3: {
      ...theme.markdownStyle.h3,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * 1.25),
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * 1.25), "compact"),
    },
    h4: {
      ...theme.markdownStyle.h4,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * 1.125),
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * 1.125), "normal"),
    },
    h5: {
      ...theme.markdownStyle.h5,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    h6: {
      ...theme.markdownStyle.h6,
      fontFamily: bodyFontFamily,
      fontSize: Math.max(12, bodyFontSize - 1),
      lineHeight: roundedLineHeight(Math.max(12, bodyFontSize - 1), settings.lineHeight),
    },
    list: {
      ...theme.markdownStyle.list,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    paragraph: {
      ...theme.markdownStyle.paragraph,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    table: {
      ...theme.markdownStyle.table,
      fontFamily: bodyFontFamily,
      fontSize: Math.max(12, bodyFontSize - 2),
    },
  };
}

export function getMarkdownLayoutForAppearance(
  theme: LegendTheme,
  settings: MarkdownAppearanceSettings,
): MarkdownDocumentLayout {
  return {
    ...theme.markdownLayout,
    blockSpacing: scaleBlockSpacing(theme.markdownLayout, settings.density),
    content: {
      horizontalPadding: horizontalPaddingByDensity[settings.density],
      maxWidth: contentWidthBySetting[settings.contentWidth],
      verticalPadding: verticalPaddingByDensity[settings.density],
    },
  };
}
