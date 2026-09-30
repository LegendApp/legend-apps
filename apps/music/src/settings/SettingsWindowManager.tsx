import { addAppListener } from "@legendapp/spark/app";
import { useMount } from "@legendapp/state/react";
import { getWindow, getDisplays } from "@legendapp/spark/windows";
import { state$ } from "../systems/State";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { WindowsNavigator } from "../windows";
const SETTINGS_WINDOW_KEY = "SettingsWindow" as const;
const SETTINGS_WINDOW_ID = WindowsNavigator.getId(SETTINGS_WINDOW_KEY);
export const SettingsWindowManager = () => {
    useMount(() => {
        perfLog("SettingsWindowManager.mount");
        const unsubscribeSettings = state$.showSettings.onChange(async ({ value }) => {
            perfLog("SettingsWindowManager.showSettingsChange", { value });
            if (value) {
                try {
                    const initialPage = state$.showSettingsPage.get();
                    const openOptions: {
                        props?: {
                            initialPage: typeof initialPage;
                        };
                    } = {};
                    if (initialPage) {
                        openOptions.props = { initialPage };
                    }
                    await WindowsNavigator.open(SETTINGS_WINDOW_KEY, openOptions);
                }
                catch (error) {
                    console.error("Failed to open window:", error);
                    perfLog("SettingsWindowManager.openWindow.error", error);
                }
            }
            else {
                try {
                    await WindowsNavigator.close(SETTINGS_WINDOW_KEY);
                }
                catch (error) {
                    console.error("Failed to close settings window:", error);
                    perfLog("SettingsWindowManager.closeWindow.error", error);
                }
            }
        });
        const subscription = addAppListener("windowClosed", ({ windowId: identifier }) => {
            perfCount("SettingsWindowManager.windowClosedEvent");
            if (identifier !== SETTINGS_WINDOW_ID) {
                return;
            }
            state$.assign({
                showSettings: false,
                showSettingsPage: undefined,
            });
        });
        return () => {
            subscription.remove();
            unsubscribeSettings();
        };
    });
    return null;
};
