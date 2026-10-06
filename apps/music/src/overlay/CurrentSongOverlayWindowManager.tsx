import { addAppListener } from "@legendapp/spark/app";
import { useMount, useObserveEffect } from "@legendapp/state/react";
import { useRef } from "react";
import { Dimensions } from "react-native";
import { getWindow, listWindows, getDisplays, setWindowBounds } from "@legendapp/spark/windows";
import { settings$ } from "../systems/Settings";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { WindowsNavigator } from "../windows";
import { cancelCurrentSongOverlay, currentSongOverlay$, finalizeCurrentSongOverlayDismissal, } from "./CurrentSongOverlayState";
import { OVERLAY_WINDOW_ANIMATION_DURATION_MS, OVERLAY_WINDOW_BOTTOM_MARGIN, OVERLAY_WINDOW_HEIGHT_COMPACT, OVERLAY_WINDOW_HORIZONTAL_MARGIN, OVERLAY_WINDOW_TOP_MARGIN, OVERLAY_WINDOW_WIDTH_COMPACT, } from "./OverlayConstants";
const OVERLAY_WINDOW_KEY = "CurrentSongOverlayWindow" as const;
const OVERLAY_WINDOW_ID = WindowsNavigator.getId(OVERLAY_WINDOW_KEY);
const DEFAULT_WIDTH = OVERLAY_WINDOW_WIDTH_COMPACT;
const DEFAULT_HEIGHT = OVERLAY_WINDOW_HEIGHT_COMPACT;
async function getOverlayDisplay() {
    const main = await getWindow("main");
    const displays = await getDisplays();
    const display = displays.find(value => value.id === main?.bounds.displayId) ?? displays.find(value => value.primary) ?? displays[0];
    if (!display) throw new Error("No display is available for the overlay");
    return display;
}

export const CurrentSongOverlayWindowManager = () => {
    perfCount("CurrentSongOverlayWindowManager.render");
    const previousDimensionsRef = useRef<{
        width: number;
        height: number;
    } | null>(null);
    useMount(() => {
        const subscription = addAppListener("windowClosed", ({ windowId: identifier }) => {
            if (identifier === OVERLAY_WINDOW_ID) {
                finalizeCurrentSongOverlayDismissal();
            }
        });
        return () => {
            subscription.remove();
        };
    });
    useObserveEffect(async () => {
        const isWindowOpen = currentSongOverlay$.isWindowOpen.get();
        const isOverlayExiting = currentSongOverlay$.isExiting.get();
        const overlayPosition = settings$.overlay.position.get();
        const windowHeight = currentSongOverlay$.windowHeight.get() ?? OVERLAY_WINDOW_HEIGHT_COMPACT;
        const windowWidth = currentSongOverlay$.windowWidth.get() ?? OVERLAY_WINDOW_WIDTH_COMPACT;
        const horizontalPosition = overlayPosition?.horizontal ?? "center";
        const verticalPosition = overlayPosition?.vertical ?? "top";
        perfLog("CurrentSongOverlayWindowManager.isOpenEffect", { isWindowOpen, isOverlayExiting });
        if (!isWindowOpen) {
            try {
                perfLog("CurrentSongOverlayWindowManager.closeWindow.start");
                if ((await listWindows()).some(window => window.id === OVERLAY_WINDOW_ID)) {
                    await WindowsNavigator.close(OVERLAY_WINDOW_KEY);
                }
            }
            catch (error) {
                console.error("Failed to close current song overlay window:", error);
                perfLog("CurrentSongOverlayWindowManager.closeWindow.error", error);
            }
            previousDimensionsRef.current = null;
            return;
        }
        if (isOverlayExiting) {
            return;
        }
        const shouldAnimateFrameChange = previousDimensionsRef.current !== null &&
            (previousDimensionsRef.current.width !== windowWidth ||
                previousDimensionsRef.current.height !== windowHeight);
        try {
            perfLog("CurrentSongOverlayWindowManager.openWindow.start");
            const display = await getOverlayDisplay();
            const { width: screenWidth, height: screenHeight } = display.size;
            let x = Math.max(Math.round((screenWidth - windowWidth) / 2), 0);
            if (horizontalPosition === "left") {
                x = OVERLAY_WINDOW_HORIZONTAL_MARGIN;
            }
            else if (horizontalPosition === "right") {
                x = Math.max(screenWidth - windowWidth - OVERLAY_WINDOW_HORIZONTAL_MARGIN, 0);
            }
            const maxY = Math.max(screenHeight - windowHeight, 0);
            const clampY = (value: number) => Math.min(Math.max(value, 0), maxY);
            let y = clampY(OVERLAY_WINDOW_TOP_MARGIN);
            if (verticalPosition === "middle") {
                y = clampY(Math.round(maxY / 2));
            }
            else if (verticalPosition === "bottom") {
                y = clampY(maxY - OVERLAY_WINDOW_BOTTOM_MARGIN);
            }
            let frameAnimationDurationMs: number | undefined;
            if (shouldAnimateFrameChange) {
                frameAnimationDurationMs = OVERLAY_WINDOW_ANIMATION_DURATION_MS;
            }
            const current = (await listWindows()).find(window => window.id === OVERLAY_WINDOW_ID);
            if (current) await setWindowBounds(OVERLAY_WINDOW_ID, { displayId: display.id, x, y, width: windowWidth, height: windowHeight }, { macos: { durationMs: frameAnimationDurationMs } });
            else {
            await WindowsNavigator.open(OVERLAY_WINDOW_KEY, {
                options: {
                    position: { displayId: display.id, x, y },
                    ...{
                        kind: "overlay",
                        titleBarStyle: "borderless",
                        size: {
                            width: windowWidth,
                            height: windowHeight
                        },
                        macos: {
                            panelStyle: "nonactivating",
                            titleBar: {
                                contentLayout: "fullSize"
                            }
                        }
                    }
                }
            });
            }
            previousDimensionsRef.current = { width: windowWidth, height: windowHeight };
        }
        catch (error) {
            console.error("Failed to open current song overlay window:", error);
            perfLog("CurrentSongOverlayWindowManager.openWindow.error", error);
        }
    });
    return null;
};
export const ensureOverlayWindowClosed = () => {
    cancelCurrentSongOverlay();
};
