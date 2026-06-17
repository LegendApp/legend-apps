import { getMarkdownMeasurementSignature } from "../markdownMeasurementSignature";

const baseLayout = {
  blockSpacing: {
    heading: 20,
    paragraph: 8,
  },
  content: {
    maxWidth: 720,
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
};

const baseStyle = {
  blockquote: { borderWidth: 2, color: "#333", paddingLeft: 12 },
  code: { color: "#333", fontFamily: "Mono", fontSize: 13 },
  codeBlock: { backgroundColor: "#111", fontFamily: "Mono", fontSize: 13, padding: 12 },
  h1: { color: "#111", fontSize: 32, lineHeight: 40 },
  h2: { color: "#111", fontSize: 26, lineHeight: 34 },
  h3: { color: "#111", fontSize: 22, lineHeight: 30 },
  h4: { color: "#111", fontSize: 18, lineHeight: 26 },
  h5: { color: "#111", fontSize: 16, lineHeight: 24 },
  h6: { color: "#111", fontSize: 14, lineHeight: 22 },
  list: { gapWidth: 8, marginTop: 4 },
  paragraph: { color: "#111", fontSize: 15, lineHeight: 23 },
  table: { cellPaddingHorizontal: 8, cellPaddingVertical: 6 },
};

describe("getMarkdownMeasurementSignature", () => {
  it("changes when markdown layout measurements change", () => {
    expect(getMarkdownMeasurementSignature(
      {
        ...baseLayout,
        content: {
          ...baseLayout.content,
          maxWidth: 840,
        },
      },
      baseStyle,
    )).not.toBe(getMarkdownMeasurementSignature(baseLayout, baseStyle));
  });

  it("changes when markdown text measurements change", () => {
    expect(getMarkdownMeasurementSignature(
      baseLayout,
      {
        ...baseStyle,
        h1: {
          ...baseStyle.h1,
          fontSize: 36,
        },
      },
    )).not.toBe(getMarkdownMeasurementSignature(baseLayout, baseStyle));
  });

  it("ignores non-measurement style changes like color", () => {
    expect(getMarkdownMeasurementSignature(
      baseLayout,
      {
        ...baseStyle,
        paragraph: {
          ...baseStyle.paragraph,
          color: "#f00",
        },
      },
    )).toBe(getMarkdownMeasurementSignature(baseLayout, baseStyle));
  });
});
