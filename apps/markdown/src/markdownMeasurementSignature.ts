function measurementStyle(style: unknown) {
  const value = style as Record<string, unknown> | undefined;
  return {
    borderWidth: value?.borderWidth,
    cellPaddingHorizontal: value?.cellPaddingHorizontal,
    cellPaddingVertical: value?.cellPaddingVertical,
    fontFamily: value?.fontFamily,
    fontSize: value?.fontSize,
    fontStyle: value?.fontStyle,
    fontWeight: value?.fontWeight,
    gapWidth: value?.gapWidth,
    letterSpacing: value?.letterSpacing,
    lineHeight: value?.lineHeight,
    marginBottom: value?.marginBottom,
    marginTop: value?.marginTop,
    padding: value?.padding,
    paddingBottom: value?.paddingBottom,
    paddingHorizontal: value?.paddingHorizontal,
    paddingLeft: value?.paddingLeft,
    paddingRight: value?.paddingRight,
    paddingTop: value?.paddingTop,
    paddingVertical: value?.paddingVertical,
  };
}

export function getMarkdownMeasurementSignature(markdownLayout: unknown, markdownStyle: unknown) {
  const layout = markdownLayout as Record<string, unknown>;
  const style = markdownStyle as Record<string, unknown>;
  return JSON.stringify({
    blockSpacing: layout.blockSpacing,
    content: layout.content,
    markdownStyle: {
      blockquote: measurementStyle(style.blockquote),
      code: measurementStyle(style.code),
      codeBlock: measurementStyle(style.codeBlock),
      h1: measurementStyle(style.h1),
      h2: measurementStyle(style.h2),
      h3: measurementStyle(style.h3),
      h4: measurementStyle(style.h4),
      h5: measurementStyle(style.h5),
      h6: measurementStyle(style.h6),
      list: measurementStyle(style.list),
      paragraph: measurementStyle(style.paragraph),
      table: measurementStyle(style.table),
    },
  });
}
