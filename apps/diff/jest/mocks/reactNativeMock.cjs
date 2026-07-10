const React = require("react");

const createComponent = (name) => (
  React.forwardRef(({ children, ...props }, ref) => React.createElement(name, { ...props, ref }, children))
);

module.exports = {
  __esModule: true,
  Linking: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    getInitialURL: jest.fn(async () => null),
    openURL: jest.fn(async () => undefined),
  },
  NativeEventEmitter: class NativeEventEmitter {
    addListener() {
      return { remove() {} };
    }
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
  TurboModuleRegistry: {
    get: jest.fn(() => null),
    getEnforcing: jest.fn(() => ({
      addListener: jest.fn(),
      removeListeners: jest.fn(),
      respondToKeyEvent: jest.fn(),
      startMonitoringKeyboard: jest.fn(async () => true),
      stopMonitoringKeyboard: jest.fn(async () => true),
    })),
  },
  View: createComponent("View"),
};
