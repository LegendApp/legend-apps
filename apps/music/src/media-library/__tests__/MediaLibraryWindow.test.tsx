// @ts-nocheck Native surfaces and child panes are mocked; this checks the split view's initial pane sizes.
const React = require("react");
const { act, create } = require("react-test-renderer");

const splitViews = [];
jest.mock("@legendapp/spark/ui/split-view", () => ({
    SidebarSplitView: (props) => {
        splitViews.push(props);
        return null;
    },
}));
jest.mock("@gorhom/portal", () => ({ PortalProvider: ({ children }) => children }));
jest.mock("../../components/dnd", () => ({ DragDropProvider: ({ children }) => children }));
jest.mock("../../components/MediaLibrary", () => ({ MediaLibraryView: () => null }));
jest.mock("../../components/MediaLibrary/Sidebar", () => ({ MediaLibrarySidebar: () => null }));
jest.mock("../../components/MediaLibrary/TrackList", () => ({ TrackList: () => null }));
jest.mock("../../components/Toast", () => ({ ToastProvider: ({ children }) => children }));
jest.mock("../../components/TooltipProvider", () => ({ TooltipProvider: ({ children }) => children }));
jest.mock("../../systems/keyboard/HookKeyboard", () => ({ HiddenTextInput: () => null }));
jest.mock("../../theme/ThemeProvider", () => ({ ThemeProvider: ({ children }) => children }));
jest.mock("../../windows", () => ({
    WindowProvider: ({ children }) => children,
    WindowsNavigator: { getId: (key) => key },
}));
jest.mock("react-native", () => ({
    ...jest.requireActual("../../../jest/mocks/reactNativeMock.cjs"),
    Platform: { OS: "macos", select: (options) => options.macos ?? options.default },
}));

const { stateSaved$ } = require("../../systems/State");
const MediaLibraryWindow = require("../MediaLibraryWindow").default;

test("sizes the library panes from the saved window size before native metrics arrive", async () => {
    stateSaved$.libraryWindowSize.set({ width: 856, height: 960 });
    let tree;
    await act(() => {
        tree = create(React.createElement(MediaLibraryWindow));
    });

    expect(splitViews.at(-1).initialPaneMetrics).toEqual({
        sidebarWidth: 220,
        sidebarHeight: 960,
        contentWidth: 635,
        contentHeight: 960,
    });
    await act(() => tree.unmount());
});
