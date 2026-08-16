if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = "macos";
}

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const renderItems = [];

  return {
    __esModule: true,
    __legendListTestHooks: {
      renderItems,
      reset: () => {
        renderItems.length = 0;
      },
    },
    LegendList: React.forwardRef(function LegendList({
      data = [],
      renderItem,
      style,
    }, ref) {
      renderItems.push(renderItem);
      React.useImperativeHandle(ref, () => ({
        clearCaches: jest.fn(),
        getState: () => ({
          elementAtIndex: (index) => (index >= 0 && index < data.length ? {} : undefined),
          end: data.length - 1,
          endBuffered: data.length - 1,
          start: 0,
          startBuffered: 0,
        }),
        scrollToIndex: jest.fn(async () => undefined),
        scrollToOffset: jest.fn(async () => undefined),
        setItemSize: jest.fn(),
      }), [data]);

      return React.createElement(
        View,
        { style },
        data.map((item, index) => React.createElement(
          React.Fragment,
          { key: item ?? index },
          renderItem({ item, index }),
        )),
      );
    }),
    useAdaptiveRender: () => "normal",
  };
});

jest.mock("@legend-apps/context-menu", () => ({
  __esModule: true,
  showContextMenu: jest.fn(async () => null),
}));

jest.mock("@legend-apps/glass-effect-view", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    __esModule: true,
    GlassEffectView: (props) => React.createElement(View, props, props.children),
    NativeGlassEffectView: View,
  };
});

jest.mock("@legend-apps/native-select", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    __esModule: true,
    NativeSelect: (props) => React.createElement(View, props),
    NativeSegmentedControl: (props) => React.createElement(View, props),
  };
});

jest.mock("@legend-apps/settings-window", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    __esModule: true,
    createSettingsWindowOptions: (options = {}) => options,
    SettingsRow: (props) => React.createElement(View, props, props.control),
    SettingsSection: (props) => React.createElement(View, props, props.children),
    SettingsWindow: (props) => React.createElement(View, props),
    VirtualizedSettingsWindow: (props) => React.createElement(View, props),
  };
});

jest.mock("uniwind", () => ({
  __esModule: true,
  useResolveClassNames: () => ({}),
}), { virtual: true });
