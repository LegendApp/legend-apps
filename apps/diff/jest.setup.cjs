if (!process.env.EXPO_OS) {
  process.env.EXPO_OS = "macos";
}

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    __esModule: true,
    LegendList: React.forwardRef(function LegendList({
      data = [],
      renderItem,
      style,
    }, ref) {
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
