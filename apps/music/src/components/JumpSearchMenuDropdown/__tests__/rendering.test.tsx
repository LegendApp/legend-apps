// @ts-nocheck Exercise compiler output with controlled native and keyboard boundaries.
import { readFileSync } from "node:fs";
import path from "node:path";
import { transformSync } from "@babel/core";
import React from "react";
import { observable } from "@legendapp/state";
import * as stateReact from "@legendapp/state/react";
import { act, create } from "react-test-renderer";

function compiled(relative, mocks) {
    const filename = path.resolve(__dirname, relative);
    const { code } = transformSync(readFileSync(filename, "utf8"), {
        filename, babelrc: false, configFile: false,
        presets: [require.resolve("@react-native/babel-preset")],
        plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
    });
    expect(code).toContain("react/compiler-runtime");
    const module = { exports: {} };
    new Function("require", "module", "exports", code)(
        (name) => ({ "@legendapp/state/react": stateReact, ...mocks }[name] ?? require(name)), module, module.exports,
    );
    return module.exports;
}

test("keyboard highlighting updates only the affected search rows and submits the current result", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const keys = { KEY_ESCAPE: 1, KEY_DOWN: 2, KEY_UP: 3, KEY_RETURN: 4 };
    let keyDown;
    const removeDown = jest.fn(), removeUp = jest.fn();
    const keyboard = {
        addKeyDownListener: jest.fn((fn) => { keyDown = fn; return removeDown; }),
        addKeyUpListener: jest.fn(() => removeUp),
        hasModifier: () => false,
    };
    const actions = { getQueueAction: () => "play-now" };
    const { useDropdownKeyboardNavigation } = compiled("../hooks.ts", {
        "../../state/playlistNavigationState": {},
        "../../systems/keyboard/KeyboardManager": { default: keyboard, __esModule: true, KeyCodes: keys },
        "../../utils/queueActions": actions,
    });
    let results = Array.from({ length: 8 }, (_, i) => ({ type: "track", item: { id: String(i), title: `Track ${i}` } }));
    const handleOpenChange = jest.fn();
    const dropdown = { searchQuery$: observable("track"), searchQuery: "track", isOpen: true, isOpen$: observable(true), handleOpenChange };
    const listRenders = jest.fn(), trackRenders = jest.fn();
    const Wrapper = ({ children }) => <>{children}</>;
    const Item = ({ children, ...props }) => <item {...props}>{children}</item>;
    const List = React.memo((props) => {
        listRenders();
        return <>{props.data.map((item, index) => props.renderItem({ item, index }))}</>;
    });
    const Track = React.memo((props) => { trackRenders(); return <track {...props} />; });
    const { JumpSearchMenuDropdown } = compiled("../../JumpSearchMenuDropdown.tsx", {
        "react-native": { View: "view", Text: "text", useWindowDimensions: () => ({ width: 800, height: 600 }) },
        "@legendapp/list/react-native": { LegendList: List },
        "@legend-apps/classnames": { cn: (...parts) => parts.filter(Boolean).join(" ") },
        "./Button": { Button: "button" },
        "./DropdownMenu": { DropdownMenu: { Root: Wrapper, Trigger: Wrapper, Content: Wrapper, Item } },
        "./TextInputSearch": { TextInputSearch: "input" }, "./TrackItem": { TrackItem: Track },
        "../systems/LibraryState": { library$: observable({ albums: [], artists: [] }) },
        "../utils/queueActions": actions,
        "./JumpSearchMenuDropdown/hooks": { useSearchDropdownState: () => dropdown, usePlaylistSearchResults: () => results, useDropdownKeyboardNavigation },
    });
    const select = jest.fn();
    let tree;
    const press = async (keyCode) => { await act(() => { expect(keyDown({ keyCode, modifiers: 0 })).toBe(true); }); };
    const highlighted = () => tree.root.findAllByType("item").findIndex((item) => item.props.className.includes("bg-white/20"));
    try {
        await act(() => { tree = create(<JumpSearchMenuDropdown tracks={[]} playlists={[]} onSelectTrack={select} />); });
        expect(highlighted()).toBe(0);
        listRenders.mockClear(); trackRenders.mockClear();
        const listenerRegistrations = keyboard.addKeyDownListener.mock.calls.length;
        for (let index = 1; index <= 5; index++) { await press(keys.KEY_DOWN); expect(highlighted()).toBe(index); }
        expect(listRenders).not.toHaveBeenCalled();
        expect(trackRenders).not.toHaveBeenCalled();
        expect(keyboard.addKeyDownListener).toHaveBeenCalledTimes(listenerRegistrations);
        await press(keys.KEY_RETURN);
        expect(select).toHaveBeenLastCalledWith(results[5].item, "play-now");
        expect(handleOpenChange).toHaveBeenCalledWith(false);
        for (let i = 0; i < 3; i++) await press(keys.KEY_DOWN);
        expect(highlighted()).toBe(0);
        await press(keys.KEY_UP);
        expect(highlighted()).toBe(7);
        // A shorter result set must reset an out-of-range highlight before submission.
        results = results.slice(0, 3);
        await act(() => tree.update(<JumpSearchMenuDropdown tracks={[]} playlists={[]} onSelectTrack={select} dropdownWidth={500} />));
        await press(keys.KEY_RETURN);
        expect(select).toHaveBeenLastCalledWith(results[0].item, "play-now");
        await press(keys.KEY_ESCAPE);
    } finally {
        if (tree) await act(() => tree.unmount());
        log.mockRestore();
    }
    expect(removeDown).toHaveBeenCalled();
    expect(removeUp).toHaveBeenCalled();
});
