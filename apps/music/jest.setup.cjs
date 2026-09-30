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

jest.mock("@legend-apps/audio-player", () => ({
    __esModule: true,
    audioPlayer: mockAudioPlayer,
    addAudioPlayerListener: mockAudioPlayer.addListener,
}));

jest.mock("@legend-apps/media-library-scanner", () => ({
    __esModule: true,
    ...mockMediaLibraryScanner,
}));

jest.mock("@legend-apps/media-tags", () => ({
    __esModule: true,
    readMediaTags: jest.fn(async () => ({ durationSeconds: 180 })),
    writeMediaTags: jest.fn(async () => ({ success: true })),
}));

jest.mock("@legendapp/spark/files", () => ({
    watch: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
    revealInFileManager: jest.fn(async () => {}),
}));
jest.mock("@legendapp/spark/app", () => ({
    beforeQuit: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
    addAppListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("@legendapp/spark/updates", () => ({
    checkForUpdates: jest.fn(async () => {}),
    getUpdateStatus: jest.fn(async () => ({ available: false, state: "idle" })),
    configureUpdates: jest.fn(async () => {}),
    startUpdates: jest.fn(async () => {}),
}));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
jest.mock("@legendapp/spark/context-menu", () => ({ showContextMenu: jest.fn(async () => ({ canceled: true })) }));
jest.mock("@legendapp/spark/drag-drop", () => ({
    DragDropView: React.forwardRef((props, ref) => React.createElement(ReactNative.View, { ...props, ref })),
}));
jest.mock("@legendapp/spark/dialogs", () => ({
    openFileDialog: jest.fn(async () => ({ canceled: true })),
    selectDirectory: jest.fn(async () => ({ canceled: true })),
}));
jest.mock("@legendapp/spark/windows", () => ({
    useWindowId: () => "main",
    WindowProvider: ({ children }) => children,
    openWindow: jest.fn(async () => ({ id: "main" })),
    closeWindow: jest.fn(async () => ({ closed: true })),
    setWindowOptions: jest.fn(async () => {}),
    getWindow: jest.fn(async () => ({ fullscreen: false })),
    addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));
jest.mock("@legendapp/spark/shortcuts/keyboard", () => ({
    addKeyboardListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
    hasModifier: (event, modifier) => (event.modifiers & modifier) === modifier,
    KeyCodes,
}));

jest.mock("@legendapp/spark/ui/symbol", () => ({
    __esModule: true,
    SFSymbol: () => null,
}));

jest.mock("@legendapp/spark/ui/sidebar", () => ({
    __esModule: true,
    SidebarItem: ({ children }) => React.createElement(React.Fragment, null, children),
    Sidebar: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("@legendapp/spark/ui/glass", () => ({
    __esModule: true,
    GlassView: ({ children }) => React.createElement(React.Fragment, null, children),
}));

jest.mock("@legendapp/spark/ui/search", () => ({
    __esModule: true,
    TextInputSearch: ReactNative.TextInput,
}));

jest.mock("@legend-apps/storage", () => {
    const { observable } = require("@legendapp/state");
    const plugins = new WeakMap();

    return {
        __esModule: true,
        createObservableFile: jest.fn(({ initialValue }) => {
            const obs$ = observable(initialValue);
            plugins.set(obs$, {
                flush: jest.fn(async () => {}),
            });
            return obs$;
        }),
        createStorage: jest.fn(() => ({
            delete: jest.fn(),
            directory: jest.fn(),
            ensureDirectory: jest.fn(),
            file: jest.fn(),
            list: jest.fn(() => []),
            read: jest.fn(),
            root: { isDirectory: true, name: "cache", uri: "file:///Users/test/Library/Caches" },
            write: jest.fn(),
        })),
        getApplicationSupportDirectory: jest.fn(() => ({})),
        getPersistPlugin: jest.fn((obs$) => plugins.get(obs$)),
        pathExists: jest.fn(() => true),
        readTextFile: jest.fn(() => ""),
        observablePersistStorage: jest.fn(() => ({
            flush: jest.fn(async () => {}),
        })),
        writeStorageBytes: jest.fn(() => true),
    };
});

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

jest.mock("./src/utils/cacheDirectories", () => {
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
