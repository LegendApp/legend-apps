if (!process.env.EXPO_OS) {
    process.env.EXPO_OS = "macos";
}

global.__DEV__ = true;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require("react");
const ReactNative = require("react-native");

const createListenerRegistry = () => {
    const listeners = {};
    return {
        addListener: jest.fn((event, handler) => {
            listeners[event] = listeners[event] ?? new Set();
            listeners[event].add(handler);
            return {
                remove: () => listeners[event]?.delete(handler),
            };
        }),
        emit: (event, payload) => {
            listeners[event]?.forEach((handler) => handler(payload));
        },
    };
};

const audioPlayerListeners = createListenerRegistry();
const mediaScannerListeners = createListenerRegistry();
const nativeMenuListeners = createListenerRegistry();
const mockNativeMenu = {
    addNativeMenuActionListener: nativeMenuListeners.addListener.bind(null, "action"),
    clearMenus: jest.fn(),
    configureMenus: jest.fn(),
    updateMenuItems: jest.fn(),
};

const mockAudioPlayer = {
    addListener: audioPlayerListeners.addListener,
    clearNowPlayingInfo: jest.fn(),
    getCurrentState: jest.fn(async () => ({
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        volume: 1,
    })),
    loadTrack: jest.fn(async () => ({ success: true })),
    pause: jest.fn(async () => ({ success: true })),
    play: jest.fn(async () => ({ success: true })),
    seek: jest.fn(async () => ({ success: true })),
    setVolume: jest.fn(async () => ({ success: true })),
    stop: jest.fn(async () => ({ success: true })),
    updateNowPlayingInfo: jest.fn(),
    __emit: audioPlayerListeners.emit,
};

const mockMediaLibraryScanner = {
    addMediaLibraryScannerListener: mediaScannerListeners.addListener,
    scanMediaLibrary: jest.fn(async () => {
        throw new Error("native scan unavailable in tests");
    }),
    __emit: mediaScannerListeners.emit,
};

const KeyCodes = {
    KEY_A: 0,
    KEY_S: 1,
    KEY_D: 2,
    KEY_F: 3,
    KEY_H: 4,
    KEY_G: 5,
    KEY_Z: 6,
    KEY_X: 7,
    KEY_C: 8,
    KEY_V: 9,
    KEY_B: 11,
    KEY_Q: 12,
    KEY_W: 13,
    KEY_E: 14,
    KEY_R: 15,
    KEY_Y: 16,
    KEY_T: 17,
    KEY_RETURN: 36,
    KEY_L: 37,
    KEY_J: 38,
    KEY_SPACE: 49,
    KEY_DELETE: 51,
    KEY_BACKSPACE: 51,
    KEY_ESCAPE: 53,
    KEY_LEFT: 123,
    KEY_RIGHT: 124,
    KEY_DOWN: 125,
    KEY_UP: 126,
    KEY_MEDIA_PLAY_PAUSE: 10001,
    KEY_MEDIA_NEXT: 10002,
    KEY_MEDIA_PREVIOUS: 10003,
    MODIFIER_CAPS_LOCK: 1 << 16,
    MODIFIER_SHIFT: 1 << 17,
    MODIFIER_CONTROL: 1 << 18,
    MODIFIER_OPTION: 1 << 19,
    MODIFIER_COMMAND: 1 << 20,
    MODIFIER_FUNCTION: 1 << 23,
};

jest.mock("@legend-desktop/audio-player", () => ({
    __esModule: true,
    audioPlayer: mockAudioPlayer,
    addAudioPlayerListener: mockAudioPlayer.addListener,
}));

jest.mock("@legend-desktop/media-library-scanner", () => ({
    __esModule: true,
    ...mockMediaLibraryScanner,
}));

jest.mock("@legend-desktop/media-tags", () => ({
    __esModule: true,
    readMediaTags: jest.fn(async () => ({ durationSeconds: 180 })),
    writeMediaTags: jest.fn(async () => ({ success: true })),
}));

jest.mock("@legend-desktop/file-system-watcher", () => ({
    __esModule: true,
    addDirectoryChangeListener: jest.fn(() => ({ remove: jest.fn() })),
    setWatchedDirectories: jest.fn(),
}));

jest.mock("@legend-desktop/app-exit", () => ({
    __esModule: true,
    addAppExitListener: jest.fn(() => ({ remove: jest.fn() })),
    completeAppExit: jest.fn(),
}));

jest.mock("@legend-desktop/auto-updater", () => ({
    __esModule: true,
    AutoUpdater: {
        checkForUpdates: jest.fn(async () => ({ success: true })),
    },
}));

jest.mock("@legend-desktop/native-menu", () => ({
    __esModule: true,
    ...mockNativeMenu,
    useNativeMenu: ({ handlers, menus, onAction, ownerId }) => {
        React.useEffect(() => {
            mockNativeMenu.configureMenus(ownerId, menus);
            const subscription = mockNativeMenu.addNativeMenuActionListener((action) => {
                if (action.ownerId === ownerId) {
                    const handler = handlers?.[action.itemId];
                    if (handler) {
                        handler(action);
                    } else {
                        onAction?.(action);
                    }
                }
            });
            return () => {
                subscription.remove();
                mockNativeMenu.clearMenus(ownerId);
            };
        }, [handlers, menus, onAction, ownerId]);
    },
    __emitNativeMenuAction: (action) => nativeMenuListeners.emit("action", action),
}));

jest.mock("@legend-desktop/context-menu", () => ({
    __esModule: true,
    showContextMenu: jest.fn(async () => null),
}));

jest.mock("@legend-desktop/drag-drop", () => ({
    __esModule: true,
    DragDropView: React.forwardRef((props, ref) => React.createElement(ReactNative.View, { ...props, ref })),
    TrackDragSource: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("@legend-desktop/file-dialog", () => ({
    __esModule: true,
    selectDirectory: jest.fn(async () => null),
    showInFinder: jest.fn(async () => false),
}));

jest.mock("@legend-desktop/window-controls", () => ({
    __esModule: true,
    default: {
        close: jest.fn(),
        hideWindowControls: jest.fn(async () => {}),
        isWindowFullScreen: jest.fn(async () => false),
        maximize: jest.fn(),
        minimize: jest.fn(),
        showWindowControls: jest.fn(async () => {}),
    },
}));

jest.mock("@legend-desktop/window-manager", () => ({
    __esModule: true,
    closeFrontmostWindow: jest.fn(async () => ({ success: true })),
    closeWindow: jest.fn(async () => ({ success: true })),
    onWindowClosed: jest.fn(() => ({ remove: jest.fn() })),
    onWindowFocused: jest.fn(() => ({ remove: jest.fn() })),
    openWindow: jest.fn(async () => ({ success: true })),
    setWindowBlur: jest.fn(async () => ({ success: true })),
    setWindowTitle: jest.fn(async () => ({ success: true })),
    useWindowManager: () => ({
        closeFrontmostWindow: jest.fn(async () => ({ success: true })),
        closeWindow: jest.fn(async () => ({ success: true })),
        getMainWindowFrame: jest.fn(async () => ({ x: 0, y: 0, width: 0, height: 0 })),
        onWindowClosed: jest.fn(() => ({ remove: jest.fn() })),
        onWindowFocused: jest.fn(() => ({ remove: jest.fn() })),
        openWindow: jest.fn(async () => ({ success: true })),
        setMainWindowFrame: jest.fn(async () => ({ success: true })),
        setWindowBlur: jest.fn(async () => ({ success: true })),
    }),
    WindowStyleMask: {
        Borderless: "Borderless",
        Closable: "Closable",
        FullSizeContentView: "FullSizeContentView",
        NonactivatingPanel: "NonactivatingPanel",
        Resizable: "Resizable",
        Titled: "Titled",
        UnifiedTitleAndToolbar: "UnifiedTitleAndToolbar",
    },
}));

jest.mock("@legend-desktop/keyboard-manager", () => ({
    __esModule: true,
    default: {
        addKeyDownListener: jest.fn(() => jest.fn()),
        addKeyUpListener: jest.fn(() => jest.fn()),
        hasModifier: (event, modifier) => (event.modifiers & modifier) === modifier,
    },
    keyboardManager: {
        addKeyDownListener: jest.fn(() => jest.fn()),
        addKeyUpListener: jest.fn(() => jest.fn()),
        hasModifier: (event, modifier) => (event.modifiers & modifier) === modifier,
    },
    KeyCodes,
}));

jest.mock("@legend-desktop/sf-symbol", () => ({
    __esModule: true,
    SFSymbol: () => null,
}));

jest.mock("@legend-desktop/sidebar", () => ({
    __esModule: true,
    NativeSidebarItemView: ({ children }) => React.createElement(React.Fragment, null, children),
    NativeSidebarView: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("@legend-desktop/glass-effect-view", () => ({
    __esModule: true,
    GlassEffectView: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("@legend-desktop/text-input-search", () => ({
    __esModule: true,
    TextInputSearch: ReactNative.TextInput,
}));

jest.mock("@legendapp/motion", () => ({
    __esModule: true,
    AnimatePresence: ({ children }) => children,
    Motion: {
        View: ReactNative.View,
    },
}));

jest.mock("@legendapp/list/react-native", () => ({
    __esModule: true,
    LegendList: React.forwardRef(() => null),
}));

jest.mock("@gorhom/portal", () => ({
    __esModule: true,
    Portal: ({ children }) => React.createElement(React.Fragment, null, children),
    PortalProvider: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("react-native-reanimated", () => ({
    __esModule: true,
    default: {
        View: ReactNative.View,
    },
    runOnJS: (fn) => fn,
    useAnimatedStyle: (fn) => (fn ? fn() : {}),
    useSharedValue: (initial) => ({ value: initial }),
    withSpring: (value) => value,
    withTiming: (value) => value,
}), { virtual: true });

jest.mock("@shopify/react-native-skia", () => ({
    __esModule: true,
    Canvas: () => null,
    Rect: () => null,
    Shader: () => null,
    Skia: {
        Data: {
            fromBytes: jest.fn(() => null),
        },
        Image: {
            MakeImageFromEncoded: jest.fn(() => null),
        },
        Paint: jest.fn(),
        RuntimeEffect: {
            Make: jest.fn(() => null),
        },
        Surface: {
            Make: jest.fn(() => null),
        },
        XYWHRect: jest.fn(() => ({})),
    },
}), { virtual: true });

jest.mock("@/utils/ExpoFSPersistPlugin", () => {
    const plugin = {
        deleteMetadata: jest.fn(),
        deleteTable: jest.fn(),
        flush: jest.fn(async () => {}),
        getMetadata: () => ({}),
        getTable: (_table, init) => init ?? {},
        initialize: jest.fn(),
        set: jest.fn(async () => {}),
        setMetadata: jest.fn(async () => {}),
    };

    return {
        __esModule: true,
        observablePersistExpoFS: jest.fn(() => plugin),
    };
});

jest.mock("@/utils/cacheDirectories", () => {
    const FileSystem = require("expo-file-system/next");

    return {
        deleteCacheFiles: jest.fn(),
        ensureCacheDirectory: jest.fn(),
        getCacheDirectory(subdirectory) {
            return new FileSystem.Directory("/tmp/cache", "Legend Music", subdirectory);
        },
        getPlaylistsDirectory() {
            return new FileSystem.Directory("/tmp/cache", "Legend Music", "playlists");
        },
    };
});
