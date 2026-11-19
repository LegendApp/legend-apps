// @ts-nocheck The player, layout and Spark hotkey router are mocked; this checks which key presses the JS playback hotkeys handle.
const React = require("react");
const { act, create } = require("react-test-renderer");

const mockRegistrations = [];
const mockControls = { togglePlayPause: jest.fn(), playNext: jest.fn(), playPrevious: jest.fn(), toggleShuffle: jest.fn(), cycleRepeatMode: jest.fn(), getCurrentState: () => ({}) };
jest.mock("@legendapp/spark/shortcuts/commands", () => ({
    ...jest.requireActual("@legendapp/spark/shortcuts/commands"),
    useRoutedHotkeys: (options) => {
        mockRegistrations.push(options);
        return { status: "ready" };
    },
}));
jest.mock("../LocalAudioPlayer", () => ({ initializeLocalAudioPlayer: () => {}, localAudioControls: mockControls }));
jest.mock("../Unregistered", () => ({ Unregistered: () => null }));
jest.mock("../../layout/MusicLayoutRenderer", () => ({ MusicLayoutRenderer: () => null }));
jest.mock("../../utils/preloadPersistence", () => ({ preloadPersistence: () => {} }));

const { MainContainer } = require("../MainContainer");

test("leaves hardware media keys to the native player and handles other bindings", async () => {
    let tree;
    await act(() => {
        tree = create(<MainContainer />);
    });
    const { handlers } = mockRegistrations.at(-1);

    expect(handlers.NextTrack({ binding: "MediaNext" })).toBe(false);
    expect(handlers.PreviousTrack({ binding: "MediaPrevious" })).toBe(false);
    expect(handlers.PlayPause({ binding: "MediaPlayPause" })).toBe(false);
    expect(mockControls.playNext).not.toHaveBeenCalled();
    expect(mockControls.playPrevious).not.toHaveBeenCalled();
    expect(mockControls.togglePlayPause).not.toHaveBeenCalled();

    expect(handlers.NextTrack({ binding: "Cmd+Right" })).toBe(true);
    expect(handlers.PlayPause({ binding: "Space" })).toBe(true);
    expect(mockControls.playNext).toHaveBeenCalledTimes(1);
    expect(mockControls.togglePlayPause).toHaveBeenCalledTimes(1);
    await act(() => tree.unmount());
});


test("Space toggles playback only while the playlist has no selection", async () => {
    const { playlistNavigationState$ } = require("../../state/playlistNavigationState");
    mockControls.togglePlayPause.mockClear();
    let tree;
    await act(() => { tree = create(<MainContainer />); });
    const { handlers } = mockRegistrations.at(-1);
    expect(handlers.PlayPauseSpace).toEqual(expect.any(Function));
    playlistNavigationState$.hasSelection.set(true);
    expect(handlers.PlayPauseSpace({ binding: "Space" })).toBe(false);
    expect(mockControls.togglePlayPause).not.toHaveBeenCalled();
    playlistNavigationState$.hasSelection.set(false);
    expect(handlers.PlayPauseSpace({ binding: "Space" })).toBe(true);
    expect(mockControls.togglePlayPause).toHaveBeenCalledTimes(1);
    await act(() => tree.unmount());
});
