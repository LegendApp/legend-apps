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
  DynamicColorMacOS: ({ light }) => light,
  PlatformColor: (name) => name,
  UIManager: { hasViewManagerConfig: () => true },
  TurboModuleRegistry: { get: jest.fn(() => null), getEnforcing: jest.fn(() => ({})) },
  NativeEventEmitter: class { addListener() { return { remove() {} }; } },
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(async () => false),
  },
  Animated: {
    parallel: (animations) => ({ start: (done) => { animations.forEach((animation) => animation.start()); done?.({ finished: true }); }, stop: () => undefined }),
    timing: (value, { toValue }) => ({ start: () => value.setValue(toValue), stop: () => undefined }),
    Value: class {
      constructor(value) { this.value = value; }
      setValue(value) { this.value = value; }
    },
    ValueXY,
    View: createComponent("Animated.View"),
  },
  Easing: {
    bezier: () => (t) => t,
  },
  InteractionManager: {
    runAfterInteractions: (task) => { task(); return { cancel: () => undefined }; },
  },
  findNodeHandle: jest.fn(() => 1),
  LayoutAnimation: {
    configureNext: jest.fn(),
  },
  PanResponder: {
    create: (handlers) => ({ panHandlers: handlers }),
  },
  PixelRatio: {
    get: () => 2,
  },
  Platform: {
    OS: "macos",
    select: (values) => values.macos ?? values.native ?? values.default,
  },
  Pressable: createComponent("Pressable"),
  ScrollView: createComponent("ScrollView"),
  StyleSheet: {
    absoluteFillObject: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
    create: (styles) => styles,
    hairlineWidth: 0.5,
    flatten,
  },
  Text: createComponent("Text"),
  Switch: createComponent("Switch"),
  TextInput: createComponent("TextInput"),
  View: createComponent("View"),
};
