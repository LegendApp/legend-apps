import { createWindowsNavigator } from "@legendapp/spark/windows";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestRenderer, type ReactTestRendererJSON } from "react-test-renderer";
import CurrentSongOverlayWindow from "../src/overlay/CurrentSongOverlayWindow";

jest.mock("@legendapp/spark/windows", () => ({
    createWindowsNavigator: jest.fn(),
    withWindowProvider: (component: unknown) => component,
}));
jest.mock("@legendapp/spark/windows/macos", () => ({ setWindowBlur: jest.fn() }));
jest.mock("@legendapp/spark/ui/settings", () => ({ createSettingsWindowOptions: () => ({}) }));
jest.mock("@legendapp/spark/ui/glass", () => ({ GlassView: "GlassView" }));
jest.mock("../src/components/PlaybackArea", () => ({ PlaybackArea: () => null }));
jest.mock("../src/components/TooltipProvider", () => ({ TooltipProvider: "TooltipProvider" }));
jest.mock("../src/theme/ThemeProvider", () => ({ ThemeProvider: "ThemeProvider" }));

test("opens a clear borderless panel without a window shadow", () => {
    expect(createWindowsNavigator).toHaveBeenCalledWith(expect.objectContaining({
        CurrentSongOverlayWindow: expect.objectContaining({
            options: expect.objectContaining({
                kind: "overlay",
                transparent: true,
                backgroundColor: "#00000000",
                hasShadow: false,
                titleBarStyle: "borderless",
                macos: expect.objectContaining({
                    level: "status",
                    panelStyle: "nonactivating",
                    titleBar: { contentLayout: "fullSize", transparent: true },
                }),
            }),
        }),
    }));
});

test("clips the backdrop to the rounded card and casts the shadow from that card", async () => {
    let overlay!: ReactTestRenderer;
    await act(() => { overlay = create(<CurrentSongOverlayWindow />); });
    try {
        const root = overlay.toJSON() as ReactTestRendererJSON;
        expect(StyleSheet.flatten(root.props.style)).toMatchObject({
            backgroundColor: "transparent",
            paddingHorizontal: 30,
        });

        const [shadow] = root.children as ReactTestRendererJSON[];
        const [clip] = shadow.children as ReactTestRendererJSON[];
        expect(clip.children).toEqual([expect.objectContaining({ type: "GlassView" })]);
        const clipStyle = StyleSheet.flatten(clip.props.style);
        expect(clipStyle).toMatchObject({ overflow: "hidden", borderRadius: expect.any(Number) });
        const shadowStyle = StyleSheet.flatten(shadow.props.style);
        expect(shadowStyle).toMatchObject({
            borderRadius: clipStyle.borderRadius,
            shadowOpacity: 0.3,
            shadowRadius: 8,
        });
        expect(shadowStyle.backgroundColor).toBeUndefined();
    } finally {
        await act(() => overlay.unmount());
    }
});
