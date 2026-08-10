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
  const clearCaches = jest.fn();
  const setItemSize = jest.fn();
  const getComponent = (Component) => (
    React.isValidElement(Component) ? Component : React.createElement(Component)
  );

  return {
    __legendListTestHooks: {
      clearCaches,
      setItemSize,
    },
    LegendList: React.forwardRef(function LegendList({
      data,
      dataSource,
      extraData,
      getItemType,
      renderItem,
      onLoad,
      style,
      contentContainerStyle,
      ListFooterComponent,
      ListFooterComponentStyle,
    }, ref) {
      const subscribe = React.useCallback(
        (listener) => dataSource ? dataSource.subscribe(listener) : () => undefined,
        [dataSource],
      );
      const getSnapshot = React.useCallback(
        () => dataSource ? dataSource.getRevision() : 0,
        [dataSource],
      );
      React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      const itemCount = dataSource ? dataSource.getLength() : data.length;

      React.useImperativeHandle(ref, () => ({
        clearCaches,
        getState: () => ({
          elementAtIndex: (index) => (index >= 0 && index < itemCount ? {} : undefined),
          end: itemCount - 1,
          endBuffered: itemCount - 1,
          positionAtIndex: (index) => index * 25,
          scroll: 0,
          scrollLength: 400,
          sizeAtIndex: (index) => 25,
          start: 0,
          startBuffered: 0,
        }),
        scrollToIndex: jest.fn(async () => undefined),
        scrollToOffset: jest.fn(async () => undefined),
        setItemSize,
      }), [itemCount]);

      React.useEffect(() => {
        onLoad?.();
      }, [onLoad]);

      return React.createElement(
        View,
        { style },
        React.createElement(
          View,
          { style: contentContainerStyle },
          Array.from({ length: itemCount }, (_, index) => {
            const item = dataSource ? dataSource.getItem(index) : data[index];
            const key = dataSource ? dataSource.getKey(index) : item;
            return React.createElement(
              React.Fragment,
              { key },
              renderItem({
                dataSource,
                extraData,
                index,
                item,
                type: getItemType?.(item, index, extraData),
              }),
            );
          }),
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

jest.mock("@legend-apps/markdown-block-editor", () => {
  const React = require("react");
  const { View } = require("react-native");
  const { EnrichedMarkdownText } = require("react-native-enriched-markdown");

  return {
    MarkdownBlockActivationView: React.forwardRef(({ children, ...props }, ref) => (
      React.createElement(View, { ...props, ref }, children)
    )),
    MarkdownBlockRenderer: ({ blockId, renderRevision, ...props }) => (
      React.createElement(EnrichedMarkdownText, { ...props, markdown: blockId, nativeMarkdownRevision: renderRevision })
    ),
    MarkdownEditorHost: React.forwardRef(({ children, ...props }, ref) => (
      React.createElement(View, { ...props, ref }, children)
    )),
  };
});

jest.mock("react-native-enriched-markdown", () => {
  const React = require("react");
  const { Text, TextInput } = require("react-native");
  const textRenderCounts = new Map();
  const inputRenderCounts = new Map();
  const inputInstances = [];

  const increment = (map, key) => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  return {
    __enrichedMarkdownTestHooks: {
      clearRenderCounts: () => {
        textRenderCounts.clear();
        inputRenderCounts.clear();
      },
      clearInputInstances: () => {
        inputInstances.length = 0;
      },
      inputInstances: () => inputInstances,
      inputRenderCount: (value) => inputRenderCounts.get(value) ?? 0,
      textRenderCount: (markdown) => textRenderCounts.get(markdown) ?? 0,
    },
    EnrichedMarkdownText({ markdown, ...props }) {
      increment(textRenderCounts, markdown);
      return React.createElement(Text, props, markdown);
    },
    EnrichedMarkdownTextInput: React.forwardRef((props, ref) => {
      increment(inputRenderCounts, props.defaultValue);
      const inputInstance = React.useMemo(() => ({
        focus: jest.fn(),
        getCaretRect: jest.fn(async () => ({ height: 18, width: 1, x: 0, y: 0 })),
        insertLink: jest.fn(),
        measureInWindow: jest.fn((callback) => callback(0, 0, 700, 18)),
        setSelection: jest.fn(),
        setSelectionForVerticalNavigation: jest.fn(),
        setValue: jest.fn(),
      }), []);
      React.useEffect(() => {
        inputInstances.push(inputInstance);
        return () => {
          const index = inputInstances.indexOf(inputInstance);
          if (index >= 0) {
            inputInstances.splice(index, 1);
          }
        };
      }, [inputInstance]);
      React.useImperativeHandle(ref, () => inputInstance);

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
