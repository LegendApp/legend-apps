global.IS_REACT_ACT_ENVIRONMENT = true;
process.env.RNTL_SKIP_AUTO_CLEANUP = "true";

jest.mock("@legend-desktop/appkit-split-view", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    SidebarSplitView: ({ children, ...props }) => React.createElement(View, props, children),
  };
});

jest.mock("@legend-desktop/reorder-controls", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    DragDropProvider: ({ children, ...props }) => React.createElement(View, props, children),
    DraggableItem: ({ children, ...props }) => React.createElement(View, props, children),
    DroppableZone: ({ children, ...props }) => React.createElement(
      View,
      props,
      typeof children === "function" ? children(false) : children,
    ),
  };
});

jest.mock("@legend-desktop/storage", () => {
  const { observable } = require("@legendapp/state");

  return {
    createObservableFile: ({ initialValue }) => observable(initialValue),
  };
});

jest.mock("@legend-desktop/keyboard-manager", () => ({
  addKeyDownListener: jest.fn(() => () => undefined),
  addKeyUpListener: jest.fn(() => () => undefined),
  createModifierMask: (...modifiers) => modifiers.reduce((mask, modifier) => mask | modifier, 0),
  hasModifier: (event, modifier) => (event.modifiers & modifier) === modifier,
  KeyCodes: {
    KEY_A: 0,
    KEY_B: 11,
    KEY_C: 8,
    KEY_D: 2,
    KEY_E: 14,
    KEY_F: 3,
    KEY_G: 5,
    KEY_H: 4,
    KEY_I: 34,
    KEY_J: 38,
    KEY_K: 40,
    KEY_L: 37,
    KEY_M: 46,
    KEY_N: 45,
    KEY_O: 31,
    KEY_P: 35,
    KEY_Q: 12,
    KEY_R: 15,
    KEY_S: 1,
    KEY_T: 17,
    KEY_U: 32,
    KEY_V: 9,
    KEY_W: 13,
    KEY_X: 7,
    KEY_Y: 16,
    KEY_Z: 6,
    KEY_BACKSPACE: 51,
    KEY_COMMA: 43,
    KEY_DELETE: 51,
    KEY_DOWN: 125,
    KEY_EQUALS: 24,
    KEY_ESCAPE: 53,
    KEY_LEFT: 123,
    KEY_MEDIA_NEXT: 10002,
    KEY_MEDIA_PLAY_PAUSE: 10001,
    KEY_MEDIA_PREVIOUS: 10003,
    KEY_MINUS: 27,
    KEY_PERIOD: 47,
    KEY_RETURN: 36,
    KEY_RIGHT: 124,
    KEY_SLASH: 44,
    KEY_SPACE: 49,
    KEY_TAB: 48,
    KEY_UP: 126,
    MODIFIER_CAPS_LOCK: 1 << 16,
    MODIFIER_COMMAND: 1 << 20,
    MODIFIER_CONTROL: 1 << 18,
    MODIFIER_FUNCTION: 1 << 23,
    MODIFIER_OPTION: 1 << 19,
    MODIFIER_SHIFT: 1 << 17,
  },
}));

jest.mock("@legend-desktop/window-manager", () => ({
  setWindowOptions: jest.fn(async () => undefined),
  setWindowTitle: jest.fn(async () => undefined),
  WindowStyleMask: {
    Closable: "Closable",
    FullSizeContentView: "FullSizeContentView",
    Resizable: "Resizable",
    Titled: "Titled",
    UnifiedTitleAndToolbar: "UnifiedTitleAndToolbar",
  },
}));

jest.mock("@legend-desktop/sf-symbol", () => ({
  SFSymbol: () => null,
}));
