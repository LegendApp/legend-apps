// @ts-nocheck Spark's routed hotkeys and window focus events are mocked; this checks which window a hotkey registration and focus tracking target.
const React = require("react");
const { act, create } = require("react-test-renderer");

const registrations = [];
jest.mock("@legendapp/spark/shortcuts/commands", () => ({
    ...jest.requireActual("@legendapp/spark/shortcuts/commands"),
    useRoutedHotkeys: (options) => {
        registrations.push(options);
        return { status: "ready" };
    },
}));
jest.mock("@legendapp/spark/windows", () => ({
    ...jest.requireActual("@legendapp/spark/windows"),
    useWindowFocusEffect: (callback) => callback(),
}));

const { WindowProvider } = require("@legendapp/spark/windows");
const Keyboard = require("../Keyboard");

function Probe(props) {
    Keyboard.useOnHotkeys({ SelectAll: () => true }, props.options);
    return null;
}

async function render(element) {
    registrations.length = 0;
    await act(() => {
        create(element);
    });
    return registrations.at(-1).scope;
}

test("scopes hotkeys to the window the component renders in", async () => {
    expect(await render(<WindowProvider id="media-library"><Probe /></WindowProvider>)).toEqual({ kind: "window", windowId: "media-library" });
});

test("marks the focused window active in the hotkey router", async () => {
    const setActiveWindowId = jest.spyOn(Keyboard.musicHotkeyRouter, "setActiveWindowId");
    function FocusProbe() {
        Keyboard.useActiveHotkeyWindow();
        return null;
    }
    await act(() => {
        create(<WindowProvider id="media-library"><FocusProbe /></WindowProvider>);
    });

    expect(setActiveWindowId).toHaveBeenLastCalledWith("media-library");
});

test("keeps explicit window and application scopes, and falls back to main without a window", async () => {
    expect(await render(<WindowProvider id="media-library"><Probe options={{ windowId: "settings" }} /></WindowProvider>)).toEqual({ kind: "window", windowId: "settings" });
    expect(await render(<WindowProvider id="media-library"><Probe options={{ global: true }} /></WindowProvider>)).toEqual({ kind: "application" });

    function NoWindowProbe() {
        Keyboard.useOnHotkeys({ SelectAll: () => true });
        return null;
    }
    expect(await render(<NoWindowProbe />)).toEqual({ kind: "window", windowId: "main" });
});
