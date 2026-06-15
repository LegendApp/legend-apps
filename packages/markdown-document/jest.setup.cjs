global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = (handle) => clearTimeout(handle);
global.IS_REACT_ACT_ENVIRONMENT = true;
global.__DEV__ = false;

jest.mock("react-native", () => {
  const React = require("react");
  const createComponent = (name) => React.forwardRef(({ children, ...props }, ref) => (
    React.createElement(name, { ...props, ref }, children)
  ));

  return {
    Linking: {
      openURL: jest.fn(async () => undefined),
    },
    Platform: {
      OS: "ios",
      select: (values) => values.ios ?? values.default,
    },
    Pressable: createComponent("Pressable"),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => {
        if (Array.isArray(style)) {
          return Object.assign({}, ...style.filter(Boolean));
        }
        return style;
      },
    },
    Text: createComponent("Text"),
    TextInput: createComponent("TextInput"),
    View: createComponent("View"),
  };
});

jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const getComponent = (Component) => (
    React.isValidElement(Component) ? Component : React.createElement(Component)
  );

  return {
    LegendList: React.forwardRef(function LegendList({
      data,
      renderItem,
      onLoad,
      style,
      contentContainerStyle,
      ListFooterComponent,
      ListFooterComponentStyle,
      onScroll,
    }, ref) {
      React.useImperativeHandle(ref, () => ({
        getState: () => ({
          elementAtIndex: (index) => (index >= 0 && index < data.length ? {} : undefined),
          end: data.length - 1,
          endBuffered: data.length - 1,
          start: 0,
          startBuffered: 0,
        }),
        scrollToIndex: jest.fn(async () => undefined),
        scrollToOffset: jest.fn(async () => undefined),
      }), [data]);

      React.useEffect(() => {
        onLoad?.();
      }, [onLoad]);

      return React.createElement(
        View,
        { onScroll, style },
        React.createElement(
          View,
          { style: contentContainerStyle },
          data.map((item, index) => React.createElement(
            React.Fragment,
            { key: item },
            renderItem({ item, index }),
          )),
          ListFooterComponent ? React.createElement(
            View,
            { style: ListFooterComponentStyle, testID: "legend-list-footer" },
            getComponent(ListFooterComponent),
          ) : null,
        ),
      );
    }),
  };
});

jest.mock("@legend-desktop/markdown-block-editor", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    MarkdownBlockActivationView: React.forwardRef(({ children, ...props }, ref) => (
      React.createElement(View, { ...props, ref }, children)
    )),
    MarkdownEditorHost: React.forwardRef(({ children, ...props }, ref) => (
      React.createElement(View, { ...props, ref }, children)
    )),
  };
});

jest.mock("react-native-enriched-markdown", () => {
  const React = require("react");
  const { Text, TextInput } = require("react-native");

  return {
    EnrichedMarkdownText({ markdown, ...props }) {
      return React.createElement(Text, props, markdown);
    },
    EnrichedMarkdownTextInput: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        focus: jest.fn(),
        getCaretRect: jest.fn(async () => ({ height: 18, width: 1, x: 0, y: 0 })),
        measureInWindow: jest.fn((callback) => callback(0, 0, 700, 18)),
        setSelection: jest.fn(),
        setValue: jest.fn(),
      }));

      return React.createElement(TextInput, {
        ...props,
        onChangeText: props.onChangeMarkdown,
        testID: "markdown-editor-input",
      });
    }),
  };
});

jest.mock("./src/adapters/nativeMarkdownDocumentAdapter", () => ({
  nativeMarkdownDocumentAdapter: {
    applyTransaction: jest.fn(),
    close: jest.fn(),
    getBlock: jest.fn(),
    getBlocks: jest.fn(),
    load: jest.fn(),
    save: jest.fn(),
    saveAs: jest.fn(),
  },
}));
