import React, { type PropsWithChildren } from "react";
import { Linking } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { OpenSourceSettingsContent } from "../OpenSourceSettings";
import { SettingsRow } from "../components";

jest.mock("@legendapp/spark/ui/settings", () => ({
    SettingsSection: ({ children }: PropsWithChildren) => children,
    SettingsRow: ({ children }: PropsWithChildren) => children,
}));
jest.mock("react-native", () => ({
    ...jest.requireActual("react-native"),
    Linking: { openURL: jest.fn() },
}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));

const links = [
    ["Legend Music is free and open source", "https://github.com/LegendApp/legend-music"],
    ["Legend Kit", "https://legendapp.com/kit"],
    ["React", "https://github.com/facebook/react"],
    ["React Native", "https://github.com/facebook/react-native"],
    ["React Native macOS", "https://github.com/microsoft/react-native-macos"],
    ["Legend State", "https://github.com/LegendApp/legend-state"],
    ["Legend List", "https://github.com/LegendApp/legend-list"],
    ["Legend Motion", "https://github.com/LegendApp/legend-motion"],
    ["Expo", "https://github.com/expo/expo"],
    ["Uniwind", "https://github.com/uniwind/uniwind"],
    ["Tailwind CSS", "https://github.com/tailwindlabs/tailwindcss"],
    ["Gorhom Portal", "https://github.com/gorhom/react-native-portal"],
    ["Biome", "https://github.com/biomejs/biome"],
];

let renderer: ReactTestRenderer;
const openURL = Linking.openURL as jest.Mock;

beforeEach(() => {
    openURL.mockClear();
    act(() => { renderer = create(<OpenSourceSettingsContent />); });
});
afterEach(() => act(() => renderer.unmount()));

it("renders one row per link, each opening its unchanged URL", () => {
    const rows = renderer.root.findAllByType(SettingsRow);
    expect(rows.map((row) => row.props.label)).toEqual(links.map(([label]) => label));

    for (const row of rows) {
        act(() => row.findByType("Button" as never).props.onPress());
    }
    expect(openURL.mock.calls.map(([url]) => url)).toEqual(links.map(([, url]) => url));
});

it("uses native push buttons with no accent fill", () => {
    const buttons = renderer.root.findAllByType("Button" as never).map((button) => button.props);
    expect(buttons).toHaveLength(links.length);
    expect(buttons.every((props) => props.variant === undefined && props.size === undefined)).toBe(true);
});
