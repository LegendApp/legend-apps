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
      data,
      dataSource,
      renderItem,
      style,
    }, ref) {
      const [dataSourceRevision, setDataSourceRevision] = React.useState(0);
      React.useEffect(() => dataSource?.subscribe(() => {
        setDataSourceRevision((revision) => revision + 1);
      }), [dataSource]);
      const itemCount = dataSource?.getLength() ?? data?.length ?? 0;
      const items = Array.from(
        { length: itemCount },
        (_, index) => dataSource?.getItem(index) ?? data?.[index],
      );
      renderItems.push(renderItem);
      React.useImperativeHandle(ref, () => ({
        clearCaches: jest.fn(),
        getState: () => ({
          elementAtIndex: (index) => (index >= 0 && index < itemCount ? {} : undefined),
          end: itemCount - 1,
          endBuffered: itemCount - 1,
          start: 0,
          startBuffered: 0,
        }),
        scrollToIndex: jest.fn(async () => undefined),
        scrollToOffset: jest.fn(async () => undefined),
        setItemSize: jest.fn(),
      }), [dataSourceRevision, itemCount]);

      return React.createElement(
        View,
        { style },
        items.map((item, index) => React.createElement(
          React.Fragment,
          { key: dataSource?.getKey(index) ?? item ?? index },
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
