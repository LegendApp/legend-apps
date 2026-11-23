import React, { type PropsWithChildren, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Pressable, Text, TextInput, View } from "react-native";
import { VirtualizedSettingsWindow, type SettingsPageProps } from "@legendapp/spark/ui/settings";
import { HotkeyCapture } from "@legendapp/spark/shortcuts/commands";

import { settings$ } from "../../systems/Settings";
import { state$ } from "../../systems/State";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { AppleMusicSettingsContent } from "../AppleMusicSettings";
import { CustomizeUISettingsContent } from "../CustomizeUISettings";
import { GeneralSettingsContent } from "../GeneralSettings";
import { OverlaySettingsContent } from "../OverlaySettings";
import { SpotifySettingsContent } from "../SpotifySettings";
import { ThemeSettingsContent } from "../ThemeSettings";
import SettingsContainer from "../SettingsContainer";
import { DroppableZone } from "../../components/dnd";
import { SettingsRow, SettingsSwitchRow, SettingsSection } from "../components";

jest.mock("@legendapp/spark/ui/settings", () => ({
    SettingsPage: () => null,
    VirtualizedSettingsWindow: () => null,
    SettingsSection: ({ children }: PropsWithChildren) => children,
    SettingsRow: ({ children }: PropsWithChildren) => children,
    SettingsSwitchRow: () => null,
}));
jest.mock("@legendapp/state/react-native", () => ({ $TextInput: require("react-native").TextInput }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ HotkeyCapture: () => null }));
jest.mock("../../components/dnd", () => ({
    DragDropProvider: ({ children }: PropsWithChildren) => children,
    DraggableItem: ({ children }: PropsWithChildren) => children,
    DroppableZone: () => null,
}));
jest.mock("../../windows", () => ({ WindowsNavigator: { getId: () => "settings" } }));
jest.mock("../HotkeysSettings", () => ({ HotkeysSettingsContent: () => null }));
jest.mock("../LibrarySettings", () => ({ LibrarySettingsContent: () => null }));
jest.mock("../../components/TooltipProvider", () => ({
    TooltipProvider: ({ children }: PropsWithChildren) => children,
    useTooltip: () => ({ showTooltip: jest.fn(), hideTooltip: jest.fn() }),
}));

let renderer: ReactTestRenderer;

function render(element: React.ReactElement) {
    act(() => { renderer = create(element); });
}

function getSwitch(label: string) {
    const row = renderer.root.findAllByType(SettingsSwitchRow).find((node) => node.props.label === label);
    if (!row) throw new Error(`Missing settings switch: ${label}`);
    return row.props;
}

afterEach(() => {
    act(() => renderer?.unmount());
});

it.each([
    [GeneralSettingsContent, "Display Hints", settings$.general.showHints],
    [GeneralSettingsContent, "Show Titlebar on Hover", settings$.general.showTitleBarOnHover],
    [GeneralSettingsContent, "Show AI toolbar", settings$.ai.toolbarEnabled],
    [AppleMusicSettingsContent, "Enable Apple Music", settings$.providers.appleMusic.enabled],
    [SpotifySettingsContent, "Enable Spotify", settings$.providers.spotify.enabled],
    [OverlaySettingsContent, "Enable overlay", settings$.overlay.enabled],
    [ThemeSettingsContent, "Liquid Glass", settings$.appearance.background.glassEnabled],
    [CustomizeUISettingsContent, "Enable playback controls", settings$.ui.playbackControlsEnabled],
] as const)("binds %p's %s switch to its setting", (Page, label, setting$) => {
    const initial = setting$.peek();
    render(<ThemeProvider><Page /></ThemeProvider>);
    expect(getSwitch(label).value).toBe(initial);

    act(() => getSwitch(label).onValueChange(!initial));

    expect(setting$.peek()).toBe(!initial);
    expect(getSwitch(label).value).toBe(!initial);
    act(() => setting$.set(initial));
});

it("keeps at least one default music source enabled", () => {
    settings$.ai.defaultSources.set(["local"]);
    render(<GeneralSettingsContent />);
    expect(getSwitch("Local Music")).toMatchObject({ value: true, disabled: true });
    expect(getSwitch("Spotify").value).toBe(false);
    expect(getSwitch("Apple Music").value).toBe(false);

    act(() => getSwitch("Local Music").onValueChange(false));
    expect(settings$.ai.defaultSources.peek()).toEqual(["local"]);

    act(() => getSwitch("Spotify").onValueChange(true));
    expect(getSwitch("Local Music").disabled).toBe(false);
    act(() => getSwitch("Local Music").onValueChange(false));
    expect(settings$.ai.defaultSources.peek()).toEqual(["spotify"]);
    expect(getSwitch("Spotify")).toMatchObject({ value: true, disabled: true });

    act(() => getSwitch("Apple Music").onValueChange(true));
    expect(settings$.ai.defaultSources.peek()).toEqual(["spotify", "appleMusic"]);

    act(() => {
        getSwitch("Apple Music").onValueChange(false);
        getSwitch("Spotify").onValueChange(false);
    });
    expect(settings$.ai.defaultSources.peek()).toEqual(["spotify"]);
});

it("enables shortcut capture with the Global Hotkey switch", () => {
    settings$.general.globalHotkeyEnabled.set(false);
    render(<GeneralSettingsContent />);
    const capture = () => renderer.root.findByType(HotkeyCapture).props;

    expect(capture().disabled).toBe(true);
    act(() => getSwitch("Global Hotkey").onValueChange(true));
    expect(settings$.general.globalHotkeyEnabled.peek()).toBe(true);
    expect(capture().disabled).toBe(false);

    act(() => capture().onCaptureChange(true));
    expect(state$.listeningForKeyPress.peek()).toBe(true);
    act(() => capture().onChange("Cmd+Shift+M"));
    expect(settings$.general.globalHotkey.peek()).toBe("Cmd+Shift+M");
    act(() => capture().onCaptureChange(false));

    act(() => getSwitch("Global Hotkey").onValueChange(false));
    expect(capture().disabled).toBe(true);
});

it.each([
    ["Default music sources", GeneralSettingsContent, "Playlists use these sources"],
    ["Playback Controls", CustomizeUISettingsContent, "Drag controls between Shown and Hidden"],
] as const)("renders the %s intro with native helper caption typography", (title, Page, intro) => {
    render(<Page />);
    const section = renderer.root.findAllByType(SettingsSection).find((node) => node.props.title === title)!;
    const caption = section.findAllByType(Text).find((node) => node.props.children.startsWith?.(intro));
    expect(caption?.props.style).toMatchObject({
        color: "secondaryLabelColor",
        fontSize: 11,
        lineHeight: 14,
    });
});

it("selects a theme with three radio tiles and no Reset", () => {
    const initial = settings$.appearance.theme.peek();
    render(<ThemeSettingsContent />);
    const radios = renderer.root.findAllByType(Pressable).filter((node) => node.props.accessibilityRole === "radio");
    expect(radios.map((node) => node.props.accessibilityLabel)).toEqual(["Light", "Dark", "Auto"]);
    expect(renderer.root.findAllByType(Text).some((node) => node.props.children === "Reset")).toBe(false);
    act(() => radios[2].props.onPress());
    expect(radios[2].props.accessibilityState.checked).toBe(true);
    expect(settings$.appearance.theme.peek()).toBe("auto");
    act(() => settings$.appearance.theme.set(initial));
});

it("renders the theme picker in the Theme settings row accessory", () => {
    render(<ThemeSettingsContent />);
    const row = renderer.root.findAllByType(SettingsRow).find((node) => node.props.label === "Theme");
    expect(row).toBeDefined();
    expect(row?.props.children.props.className).toBe("flex-row items-center gap-3");
    expect(row?.props.children.props.accessibilityRole).toBe("radiogroup");
    expect(renderer.root.findAllByType(SettingsSection).some((section) => section.props.title === "Theme")).toBe(false);
});

it("aligns the Background Color input and swatch in one row", () => {
    render(<ThemeSettingsContent />);
    const input = renderer.root.findByType(TextInput);
    const row = renderer.root.findAllByType(View).find((node) =>
        node.props.className?.includes("flex-row items-center") && node.findAllByType(TextInput).includes(input));
    expect(row?.findAllByType(View).some((node) => node.props.style?.backgroundColor === settings$.appearance.background.color.peek())).toBe(true);
    expect(input.props.style).toMatchObject({ fontSize: 13, paddingVertical: 0 });
});

it("uses the same single-line input style for Overlay duration", () => {
    render(<OverlaySettingsContent />);
    expect(renderer.root.findByType(TextInput).props.style).toMatchObject({ fontSize: 13, paddingVertical: 0 });
});

it("keeps playback chips compact and moves controls through the drop zones", () => {
    const initial = settings$.ui.playback.peek();
    settings$.ui.playback.set({ shown: ["previous", "next"] });
    render(<CustomizeUISettingsContent />);
    const findView = (className: string) => renderer.root.findAllByType(View).filter((node) => node.props.className === className);
    expect(findView("flex-row flex-wrap items-center gap-2")).toHaveLength(2);
    expect(renderer.root.findAllByType(View).some((node) => node.props.className?.startsWith("h-8 flex-row items-center"))).toBe(true);

    const drop = (id: string, controlId: string, group: "shown" | "hidden") => {
        const zone = renderer.root.findAllByType(DroppableZone).find((node) => node.props.id === id)!;
        act(() => zone.props.onDrop({ data: { controlId, group } }));
    };
    drop("playback-shown-drop-0", "next", "shown");
    expect(settings$.ui.playback.peek().shown).toEqual(["next", "previous"]);
    drop("playback-hidden-drop-0", "next", "shown");
    expect(settings$.ui.playback.peek().shown).toEqual(["previous"]);
    drop("playback-shown-drop-1", "next", "hidden");
    expect(settings$.ui.playback.peek().shown).toEqual(["previous", "next"]);
    act(() => settings$.ui.playback.set(initial));
});

it("uses the native title as the heading for each settings page", () => {
    render(<SettingsContainer initialPage="apple-music" />);
    const window = renderer.root.findByType(VirtualizedSettingsWindow);
    expect(window.props.defaultPageId).toBe("apple-music");
    const pages: ReactElement<SettingsPageProps>[] = window.props.children;
    expect(pages.map((page) => page.props.title)).toEqual(expect.arrayContaining(["Apple Music", "Overlay"]));
    for (const { props: { children, heading } } of pages) {
        expect(heading).toBe(false);
        expect(React.Children.only(children)).not.toHaveProperty("type", Text);
    }
});
