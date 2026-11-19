import { openWindow, type WindowsConfig } from "@legendapp/spark/windows";
import { getMusicTheme } from "../../theme/musicThemes";
import { WindowsNavigator } from "../../windows";
import { createLibraryWindowStyle } from "../libraryWindowStyle";

jest.mock("react-native", () => ({
    ...jest.requireActual("../../../jest/mocks/reactNativeMock.cjs"),
    AppRegistry: { registerComponent: jest.fn() },
}));
jest.mock("@legendapp/spark/windows", () => {
    const spark = jest.requireActual<typeof import("@legendapp/spark/windows")>("@legendapp/spark/windows");
    return {
        ...spark,
        createWindowsNavigator: (config: WindowsConfig) => spark.createWindowsNavigator({
            ...config,
            MediaLibraryWindow: {
                id: config.MediaLibraryWindow.id,
                options: config.MediaLibraryWindow.options,
                loadComponent: async () => () => null,
            },
        }),
    };
});
jest.mock("@legendapp/spark-desktop-windows/src/api", () => ({ openWindow: jest.fn(async () => ({ id: "media-library" })) }));
jest.mock("@legendapp/spark/settings/window", () => ({ createSettingsWindowOptions: () => ({}) }));

test("keeps title-bar and restoration defaults when opening and reopening with a partial style", async () => {
    const style = createLibraryWindowStyle(getMusicTheme("dark"));

    await WindowsNavigator.open("MediaLibraryWindow", { options: style });
    await WindowsNavigator.open("MediaLibraryWindow", {
        options: { ...style, macos: { ...style.macos, titleBar: { trafficLights: false } } },
    });

    const titleBar = { contentLayout: "fullSize", transparent: true, titleVisibility: "hidden" };
    expect(openWindow).toHaveBeenNthCalledWith(1, expect.objectContaining({
        id: "media-library",
        appearance: "dark",
        macos: expect.objectContaining({ restoreOnLaunch: true, titleBar }),
    }));
    expect(openWindow).toHaveBeenNthCalledWith(2, expect.objectContaining({
        macos: expect.objectContaining({ restoreOnLaunch: true, titleBar: { ...titleBar, trafficLights: false } }),
    }));
    expect(style.macos).not.toHaveProperty("titleBar");
});
