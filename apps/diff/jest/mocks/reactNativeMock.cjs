const React = require("react");

const createComponent = (name) => (
  React.forwardRef(({ children, ...props }, ref) => React.createElement(name, { ...props, ref }, children))
);

module.exports = {
  __esModule: true,
  Linking: {
    openURL: jest.fn(async () => undefined),
  },
  Platform: {
    OS: "macos",
    select: (values) => values.macos ?? values.native ?? values.default,
  },
  Pressable: createComponent("Pressable"),
  StyleSheet: {
    absoluteFillObject: {},
    create: (styles) => styles,
    flatten: (style) => style,
  },
  Text: createComponent("Text"),
  TextInput: createComponent("TextInput"),
  View: createComponent("View"),
};
