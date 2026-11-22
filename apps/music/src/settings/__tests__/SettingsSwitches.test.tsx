import React, { type PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
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
import { SettingsSwitchRow } from "../components";

jest.mock("@legendapp/spark/ui/settings", () => ({
    SettingsSection: ({ children }: PropsWithChildren) => children,
    SettingsRow: ({ children }: PropsWithChildren) => children,
    SettingsSwitchRow: () => null,
}));
jest.mock("@legendapp/state/react-native", () => ({ $TextInput: () => null }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ HotkeyCapture: () => null }));
jest.mock("../../components/dnd", () => ({
    DragDropProvider: ({ children }: PropsWithChildren) => children,
    DraggableItem: ({ children }: PropsWithChildren) => children,
    DroppableZone: () => null,
}));
jest.mock("../../components/TooltipProvider", () => ({
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
