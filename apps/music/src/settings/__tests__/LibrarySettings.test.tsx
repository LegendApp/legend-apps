import React, { type PropsWithChildren } from "react";
import { Text } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { librarySettings$, localMusicState$ } from "../../systems/LocalMusicState";
import { LibrarySettingsContent } from "../LibrarySettings";
import { SettingsRow } from "../components";

jest.mock("@legendapp/spark/ui/settings", () => ({
    SettingsSection: ({ children }: PropsWithChildren) => children,
    SettingsRow: ({ children }: PropsWithChildren) => children,
}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn() }));

let renderer: ReactTestRenderer;
const buttonLabels = () => renderer.root.findAllByType("Button" as never).map((node) => node.props.children);
const texts = () => renderer.root.findAllByType(Text).map((node) => node.props.children);

afterEach(() => act(() => renderer.unmount()));

it("shows one subtle empty line and only Add Folder when no folders are configured", () => {
    act(() => {
        librarySettings$.paths.set([]);
        localMusicState$.error.set(null);
    });
    act(() => { renderer = create(<LibrarySettingsContent />); });

    expect(texts()).toEqual(["Add a folder to build your library."]);
    expect(buttonLabels()).toEqual(["Add Folder…"]);
});

it("lists each folder as a row with Remove, and offers Rescan", () => {
    act(() => librarySettings$.paths.set(["/Users/me/Music/Albums"]));
    act(() => { renderer = create(<LibrarySettingsContent />); });

    const rows = renderer.root.findAllByType(SettingsRow);
    expect(rows.map((row) => row.props.label)).toEqual(["Albums"]);
    expect(rows[0].props.description).toBe("/Users/me/Music/Albums · 0 tracks");
    expect(buttonLabels()).toEqual(["Remove", "Rescan", "Add Folder…"]);

    act(() => rows[0].findByType("Button" as never).props.onPress());
    expect(librarySettings$.paths.peek()).toEqual([]);
});
