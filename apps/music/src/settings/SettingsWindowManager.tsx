import { useMount } from "@legendapp/state/react";

import { useWindowManager } from "@legend-desktop/window-manager";
import { state$ } from "@/systems/State";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";
import { WindowsNavigator } from "@/windows";

const SETTINGS_WINDOW_KEY = "SettingsWindow" as const;
const SETTINGS_WINDOW_ID = WindowsNavigator.getIdentifier(SETTINGS_WINDOW_KEY);

export const SettingsWindowManager = () => {
    const windowManager = useWindowManager();

    useMount(() => {
        perfLog("SettingsWindowManager.mount");
        state$.showSettings.onChange(async ({ value }) => {
            perfLog("SettingsWindowManager.showSettingsChange", { value });
            if (value) {
                try {
                    const initialPage = state$.showSettingsPage.get();
                    const openOptions: { initialProperties?: { initialPage: typeof initialPage } } = {};
                    if (initialPage) {
                        openOptions.initialProperties = { initialPage };
                    }
                    await WindowsNavigator.open(SETTINGS_WINDOW_KEY, openOptions);
                } catch (error) {
                    console.error("Failed to open window:", error);
                    perfLog("SettingsWindowManager.openWindow.error", error);
                }
            } else {
                try {
                    await WindowsNavigator.close(SETTINGS_WINDOW_KEY);
                } catch (error) {
                    console.error("Failed to close settings window:", error);
                    perfLog("SettingsWindowManager.closeWindow.error", error);
                }
            }
        });

        const subscription = windowManager.onWindowClosed(({ identifier }) => {
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
        };
    });

    return null;
};
