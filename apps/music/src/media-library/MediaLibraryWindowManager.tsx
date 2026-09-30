import { addAppListener } from "@legendapp/spark/app";
import { useMount, useObserveEffect } from "@legendapp/state/react";
import { useCallback } from "react";
import { Dimensions } from "react-native";
import { getWindow, getDisplays } from "@legendapp/spark/windows";
import { useOnHotkeys } from "../systems/keyboard/Keyboard";
import { stateSaved$ } from "../systems/State";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { WindowsNavigator } from "../windows";
import { createLibraryWindowStyle } from "./libraryWindowStyle";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { getMusicTheme } from "../theme/musicThemes";
const MEDIA_LIBRARY_WINDOW_KEY = "MediaLibraryWindow" as const;
const MEDIA_LIBRARY_WINDOW_ID = WindowsNavigator.getId(MEDIA_LIBRARY_WINDOW_KEY);
const MEDIA_LIBRARY_DEFAULT_WIDTH = 640;
const MEDIA_LIBRARY_MIN_WIDTH = 360;
const MEDIA_LIBRARY_MIN_HEIGHT = 400;
const MEDIA_LIBRARY_DEFAULT_HEIGHT = 600;
const WINDOW_GAP = 16;
const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
};
async function getMainDisplayGeometry() {
    const mainWindow = await getWindow("main");
    if (!mainWindow) throw new Error("Main window is unavailable");
    const mainFrame = mainWindow.bounds;
    const display = (await getDisplays()).find(value => value.id === mainFrame.displayId);
    if (!display) throw new Error("Main window display is unavailable");
    return { mainFrame, screen: display.size };
}

export const MediaLibraryWindowManager = () => {
    perfCount("MediaLibraryWindowManager.render");
    const toggleLibrary = useCallback(() => {
        perfLog("MediaLibraryWindowManager.toggleLibrary", { isOpen: stateSaved$.libraryIsOpen.get() });
        const current = stateSaved$.libraryIsOpen.get();
        stateSaved$.libraryIsOpen.set(!current);
    }, []);
    useOnHotkeys({
        ToggleLibrary: toggleLibrary,
    });
    useMount(() => {
        perfLog("MediaLibraryWindowManager.windowClosedEffect");
        const subscription = addAppListener("windowClosed", ({ windowId: identifier }) => {
            if (identifier === MEDIA_LIBRARY_WINDOW_ID) {
                stateSaved$.libraryIsOpen.set(false);
            }
        });
        return () => {
            subscription.remove();
        };
    });
    useObserveEffect(async () => {
        const isOpen = stateSaved$.libraryIsOpen.get();
        perfLog("MediaLibraryWindowManager.isOpenEffect", { isOpen });
        if (isOpen) {
            try {
                perfLog("MediaLibraryWindowManager.openWindow.start");
                const { mainFrame, screen } = await getMainDisplayGeometry();
                const storedSize = stateSaved$.libraryWindowSize.get();
                let preferredWidth: number;
                if (storedSize.width > 0) {
                    preferredWidth = storedSize.width;
                }
                else {
                    preferredWidth = MEDIA_LIBRARY_DEFAULT_WIDTH;
                }
                let preferredHeight: number;
                if (storedSize.height > 0) {
                    preferredHeight = storedSize.height;
                }
                else {
                    preferredHeight = Math.max(mainFrame.height, MEDIA_LIBRARY_DEFAULT_HEIGHT);
                }
                const maxWidth = Math.max(screen.width - WINDOW_GAP, MEDIA_LIBRARY_MIN_WIDTH);
                const maxHeight = Math.max(screen.height - WINDOW_GAP, MEDIA_LIBRARY_MIN_HEIGHT);
                const width = clamp(Math.floor(preferredWidth), MEDIA_LIBRARY_MIN_WIDTH, maxWidth);
                const height = clamp(Math.floor(preferredHeight), MEDIA_LIBRARY_MIN_HEIGHT, maxHeight);
                const fitsOnRight = mainFrame.x + mainFrame.width + WINDOW_GAP + width <= screen.width;
                let x: number;
                if (fitsOnRight) {
                    x = mainFrame.x + mainFrame.width + WINDOW_GAP;
                }
                else {
                    x = Math.max(mainFrame.x - WINDOW_GAP - width, 0);
                }
                const y = Math.max(mainFrame.y, 0);
                const appearance = normalizeMusicAppearanceSettings(settings$.appearance.peek());
                await WindowsNavigator.open(MEDIA_LIBRARY_WINDOW_KEY, {
                    options: {
                        position: { displayId: mainFrame.displayId, x, y },
                        ...{
                            ...createLibraryWindowStyle(getMusicTheme(appearance.theme)),
                            size: { width, height }
                        }
                    }
                });
            }
            catch (error) {
                console.error("Failed to open media library window:", error);
                perfLog("MediaLibraryWindowManager.openWindow.error", error);
            }
        }
        else {
            try {
                perfLog("MediaLibraryWindowManager.closeWindow.start");
                await WindowsNavigator.close(MEDIA_LIBRARY_WINDOW_KEY);
            }
            catch (error) {
                console.error("Failed to close media library window:", error);
                perfLog("MediaLibraryWindowManager.closeWindow.error", error);
            }
        }
    });
    return null;
};
