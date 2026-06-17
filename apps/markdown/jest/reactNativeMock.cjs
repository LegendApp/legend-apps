const React = require("react");

function createComponent(name) {
  return React.forwardRef(({ children, ...props }, ref) => (
    React.createElement(name, { ...props, ref }, children)
  ));
}

const flatten = (style) => {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flatten));
  }
  return style ?? {};
};

class ValueXY {
  constructor(value = { x: 0, y: 0 }) {
    this.x = {
      removeAllListeners: () => undefined,
    };
    this.y = {
      removeAllListeners: () => undefined,
    };
    this.value = value;
  }

  flattenOffset() {}

  setOffset(value) {
    this.offset = value;
  }

  setValue(value) {
    this.value = value;
  }

  getLayout() {
    return {};
  }
}

module.exports = {
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(async () => false),
  },
  Animated: {
    ValueXY,
    View: createComponent("Animated.View"),
  },
  findNodeHandle: jest.fn(() => 1),
  LayoutAnimation: {
    configureNext: jest.fn(),
  },
  PanResponder: {
    create: (handlers) => ({ panHandlers: handlers }),
  },
  Platform: {
    OS: "macos",
    select: (values) => values.macos ?? values.native ?? values.default,
  },
  Pressable: createComponent("Pressable"),
  ScrollView: createComponent("ScrollView"),
  StyleSheet: {
    create: (styles) => styles,
    flatten,
  },
  Text: createComponent("Text"),
  TextInput: createComponent("TextInput"),
  View: createComponent("View"),
};
