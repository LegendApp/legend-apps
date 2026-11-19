// @ts-nocheck Native animation and window surfaces are controlled; test dismissal and hover state transitions.
const React = require("react");
const { act, create } = require("react-test-renderer");
jest.mock("@legendapp/spark/windows/macos", () => ({ setWindowBlur: jest.fn(async () => {}) }));
const mockAnimations = [];
const mockTiming = jest.fn((value, config) => {
    const animation = { config, start: jest.fn(callback => { animation.complete = callback; }), stop: jest.fn() };
    mockAnimations.push(animation);
    return animation;
});
jest.mock("react-native", () => ({
    ...jest.requireActual("../../../jest/mocks/reactNativeMock.cjs"),
    Animated: {
        Value: class { setValue = jest.fn(); },
        View: "animated-view", timing: (...args) => mockTiming(...args),
        spring: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
        parallel: animations => ({ start: callback => animations.forEach(animation => animation.start(callback)), stop: () => animations.forEach(animation => animation.stop()) }),
    },
    Easing: { cubic: x => x, in: x => x, out: x => x },
}));
jest.mock("../../windows", () => ({ withWindowProvider: component => component }));
jest.mock("../../components/PlaybackArea", () => ({ PlaybackArea: "playback" }));
jest.mock("@gorhom/portal", () => ({ PortalProvider: ({ children }) => children }));
jest.mock("../../components/TooltipProvider", () => ({ TooltipProvider: ({ children }) => children }));
jest.mock("../../theme/ThemeProvider", () => ({ ThemeProvider: ({ children }) => children }));
const { currentSongOverlay$, presentCurrentSongOverlay, requestCurrentSongOverlayDismissal, cancelCurrentSongOverlay } = require("../CurrentSongOverlayState");
const { settings$ } = require("../../systems/Settings");
const constants = require("../OverlayConstants");
const Overlay = require("../CurrentSongOverlayWindow").default;

beforeEach(() => { settings$.overlay.enabled.set(true); mockAnimations.length = 0; mockTiming.mockClear(); });

test("fades content on show and hides only after its exit animation finishes", async () => {
    presentCurrentSongOverlay();
    let tree;
    await act(() => { tree = create(<Overlay />); });
    expect(mockTiming).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: constants.OVERLAY_WINDOW_SHOW_DURATION_MS }));
    await act(() => requestCurrentSongOverlayDismissal());
    const hide = mockAnimations.find(animation => animation.config.toValue === 0);
    expect(hide).toBeDefined();
    expect(currentSongOverlay$.isWindowOpen.peek()).toBe(true);
    await act(() => hide.complete({ finished: true }));
    expect(currentSongOverlay$.isWindowOpen.peek()).toBe(false);
    await act(() => tree.unmount());
    cancelCurrentSongOverlay();
});

test("hover expands the frame and reveals timeline/controls; leaving restores compact size", async () => {
    presentCurrentSongOverlay();
    let tree;
    await act(() => { tree = create(<Overlay />); });
    const root = tree.root.find(node => typeof node.props.onMouseEnter === "function");
    await act(() => root.props.onMouseEnter());
    expect(currentSongOverlay$.windowWidth.peek()).toBeGreaterThan(constants.OVERLAY_WINDOW_WIDTH_COMPACT);
    expect(currentSongOverlay$.windowHeight.peek()).toBeGreaterThan(constants.OVERLAY_WINDOW_HEIGHT_COMPACT);
    expect(tree.root.findByType("playback").props.overlayMode.showControls).toBe(true);
    await act(() => root.props.onMouseLeave());
    expect(currentSongOverlay$.windowWidth.peek()).toBe(constants.OVERLAY_WINDOW_WIDTH_COMPACT);
    expect(currentSongOverlay$.windowHeight.peek()).toBe(constants.OVERLAY_WINDOW_HEIGHT_COMPACT);
    await act(() => tree.unmount());
    cancelCurrentSongOverlay();
});
