const React = require("react");
const { Text } = require("react-native");

module.exports = {
  __esModule: true,
  LightText: ({ children, ...props }) => React.createElement(Text, props, children),
  TokenizedText: ({ line, ...props }) => React.createElement(Text, props, line?.text),
  createSyntaxStyleMap: (styles) => new Map(styles.map((style) => [style.id, style])),
  nowMs: () => 0,
  sourceViewerCodeFontFamily: "Menlo",
  sourceViewerLineNumberWidth: 72,
  sourceViewerRowHeight: 22,
};
