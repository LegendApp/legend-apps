const React = require("react");

const createComponent = (name) =>
    React.forwardRef(({ children, ...props }, ref) => React.createElement(name, { ...props, ref }, children));

const NativeEventEmitter = class {
    addListener() {
        return { remove() {} };
    }
    removeAllListeners() {}
    removeListener() {}
};

module.exports = {
    Alert: {
        alert: jest.fn((_title, _message, buttons) => {
            const confirmButton = Array.isArray(buttons) ? buttons.find((button) => button.style !== "cancel") : null;
            confirmButton?.onPress?.();
        }),
    },
    InteractionManager: {
        runAfterInteractions: jest.fn((callback) => {
            callback?.();
            return { cancel() {} };
        }),
    },
    findNodeHandle: jest.fn(() => 1),
    LogBox: {
        ignoreLogs: jest.fn(),
    },
    NativeEventEmitter,
    NativeModules: {},
    Platform: {
        OS: "macos",
        Version: "15.0",
        select: (values) => values.macos ?? values.default,
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
        getEnforcing: jest.fn(() => ({})),
    },
    UIManager: {
        measureInWindow: jest.fn(),
    },
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    View: createComponent("View"),
};
