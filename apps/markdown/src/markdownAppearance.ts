import type { LegendDisplayTheme, MarkdownLayoutTheme } from "@legend-desktop/theme";
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

const fontSizeOffsetBySetting: Record<MarkdownFontSizeSetting, number> = {
  default: 0,
  large: 2,
  small: -2,
  xlarge: 4,
};

const lineHeightScaleBySetting: Record<MarkdownLineHeightSetting, number> = {
  compact: 1.45 / 1.58,
  normal: 1,
  relaxed: 1.75 / 1.58,
};

const contentWidthOverrideBySetting: Record<MarkdownContentWidthSetting, number | undefined> = {
  full: 2000,
  narrow: 680,
  standard: undefined,
  wide: 980,
};

const horizontalPaddingScaleByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 1,
  compact: 0.7,
  spacious: 1.4,
};

const verticalPaddingScaleByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 1,
  compact: 2 / 3,
  spacious: 4 / 3,
};

const spacingScaleByDensity: Record<MarkdownDocumentDensitySetting, number> = {
  comfortable: 1,
  compact: 0.78,
  spacious: 1.22,
};

function roundedLineHeight(fontSize: number, lineHeightScale: number) {
  return Math.round(fontSize * lineHeightScale);
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
  displayTheme: LegendDisplayTheme,
  layoutTheme: MarkdownLayoutTheme,
  settings: MarkdownAppearanceSettings,
): MarkdownStyle {
  const { blocks, typography } = layoutTheme;
  const bodyFontSize = Math.max(12, typography.bodyFontSize + fontSizeOffsetBySetting[settings.fontSize]);
  const bodyLineHeightScale = typography.lineHeightScale * lineHeightScaleBySetting[settings.lineHeight];
  const bodyLineHeight = roundedLineHeight(bodyFontSize, bodyLineHeightScale);
  const bodyFontFamily = fontFamilyBySetting[settings.fontFamily] ?? typography.bodyFontFamily;
  const codeFontSize = Math.max(12, bodyFontSize + typography.codeFontSizeOffset);
  const codeLineHeight = roundedLineHeight(codeFontSize, bodyLineHeightScale);
  const blockquoteFontSize = Math.max(12, bodyFontSize + typography.blockquoteFontSizeOffset);
  const tableFontSize = Math.max(12, bodyFontSize + typography.tableFontSizeOffset);

  return {
    ...displayTheme.markdownStyle,
    blockquote: {
      ...displayTheme.markdownStyle.blockquote,
      borderWidth: blocks.blockquoteBorderWidth,
      fontFamily: bodyFontFamily,
      fontSize: blockquoteFontSize,
      lineHeight: roundedLineHeight(blockquoteFontSize, bodyLineHeightScale),
    },
    code: {
      ...displayTheme.markdownStyle.code,
      fontFamily: typography.codeFontFamily,
      fontSize: codeFontSize,
    },
    codeBlock: {
      ...displayTheme.markdownStyle.codeBlock,
      borderRadius: blocks.codeBlockBorderRadius,
      borderWidth: blocks.codeBlockBorderWidth,
      fontFamily: typography.codeFontFamily,
      fontSize: codeFontSize,
      lineHeight: codeLineHeight,
      padding: blocks.codeBlockPadding,
    },
    h1: {
      ...displayTheme.markdownStyle.h1,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * typography.headingScale[1]),
      fontWeight: typography.headingWeight,
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * typography.headingScale[1]), typography.headingLineHeightScale),
    },
    h2: {
      ...displayTheme.markdownStyle.h2,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * typography.headingScale[2]),
      fontWeight: typography.headingWeight,
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * typography.headingScale[2]), typography.headingLineHeightScale),
    },
    h3: {
      ...displayTheme.markdownStyle.h3,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * typography.headingScale[3]),
      fontWeight: typography.headingWeight,
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * typography.headingScale[3]), typography.headingLineHeightScale),
    },
    h4: {
      ...displayTheme.markdownStyle.h4,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * typography.headingScale[4]),
      fontWeight: typography.headingWeight,
      lineHeight: roundedLineHeight(Math.round(bodyFontSize * typography.headingScale[4]), typography.headingLineHeightScale),
    },
    h5: {
      ...displayTheme.markdownStyle.h5,
      fontFamily: bodyFontFamily,
      fontSize: Math.round(bodyFontSize * typography.headingScale[5]),
      fontWeight: typography.headingWeight,
      lineHeight: bodyLineHeight,
    },
    h6: {
      ...displayTheme.markdownStyle.h6,
      fontFamily: bodyFontFamily,
      fontSize: Math.max(12, Math.round(bodyFontSize * typography.headingScale[6])),
      fontWeight: typography.headingWeight,
      lineHeight: roundedLineHeight(Math.max(12, Math.round(bodyFontSize * typography.headingScale[6])), bodyLineHeightScale),
    },
    list: {
      ...displayTheme.markdownStyle.list,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize,
      gapWidth: blocks.listGapWidth,
      lineHeight: bodyLineHeight,
    },
    paragraph: {
      ...displayTheme.markdownStyle.paragraph,
      fontFamily: bodyFontFamily,
      fontSize: bodyFontSize,
      lineHeight: bodyLineHeight,
    },
    table: {
      ...displayTheme.markdownStyle.table,
      borderRadius: blocks.tableBorderRadius,
      borderWidth: blocks.tableBorderWidth,
      cellPaddingHorizontal: blocks.tableCellPaddingHorizontal,
      cellPaddingVertical: blocks.tableCellPaddingVertical,
      fontFamily: bodyFontFamily,
      fontSize: tableFontSize,
    },
  };
}

export function getMarkdownLayoutForAppearance(
  layoutTheme: MarkdownLayoutTheme,
  settings: MarkdownAppearanceSettings,
): MarkdownDocumentLayout {
  const contentWidthOverride = contentWidthOverrideBySetting[settings.contentWidth];

  return {
    ...layoutTheme.markdownLayout,
    blockSpacing: scaleBlockSpacing(layoutTheme.markdownLayout, settings.density),
    content: {
      horizontalPadding: scaled(layoutTheme.content.horizontalPadding, horizontalPaddingScaleByDensity[settings.density]),
      maxWidth: contentWidthOverride ?? layoutTheme.content.maxWidth,
      verticalPadding: scaled(layoutTheme.content.verticalPadding, verticalPaddingScaleByDensity[settings.density]),
    },
  };
}
