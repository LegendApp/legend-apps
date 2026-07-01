import { useMount, useObserveEffect } from "@legendapp/state/react";
import { useRef } from "react";
import { Dimensions } from "react-native";

import { useWindowManager, WindowStyleMask } from "@legend-desktop/window-manager";
import { settings$ } from "@/systems/Settings";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";
import { WindowsNavigator } from "@/windows";

import {
    cancelCurrentSongOverlay,
    currentSongOverlay$,
    finalizeCurrentSongOverlayDismissal,
} from "./CurrentSongOverlayState";

import {
    OVERLAY_WINDOW_ANIMATION_DURATION_MS,
    OVERLAY_WINDOW_BOTTOM_MARGIN,
    OVERLAY_WINDOW_HEIGHT_COMPACT,
    OVERLAY_WINDOW_HORIZONTAL_MARGIN,
    OVERLAY_WINDOW_TOP_MARGIN,
    OVERLAY_WINDOW_WIDTH_COMPACT,
} from "./OverlayConstants";

const OVERLAY_WINDOW_KEY = "CurrentSongOverlayWindow" as const;
const OVERLAY_WINDOW_ID = WindowsNavigator.getIdentifier(OVERLAY_WINDOW_KEY);
const DEFAULT_WIDTH = OVERLAY_WINDOW_WIDTH_COMPACT;
const DEFAULT_HEIGHT = OVERLAY_WINDOW_HEIGHT_COMPACT;

export const CurrentSongOverlayWindowManager = () => {
    perfCount("CurrentSongOverlayWindowManager.render");
    const windowManager = useWindowManager();
    const previousDimensionsRef = useRef<{ width: number; height: number } | null>(null);

    useMount(() => {
        const subscription = windowManager.onWindowClosed(({ identifier }) => {
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
                await WindowsNavigator.close(OVERLAY_WINDOW_KEY);
            } catch (error) {
                console.error("Failed to close current song overlay window:", error);
                perfLog("CurrentSongOverlayWindowManager.closeWindow.error", error);
            }
            previousDimensionsRef.current = null;
            return;
        }

        if (isOverlayExiting) {
            return;
        }

        const shouldAnimateFrameChange =
            previousDimensionsRef.current !== null &&
            (previousDimensionsRef.current.width !== windowWidth ||
                previousDimensionsRef.current.height !== windowHeight);

        try {
            perfLog("CurrentSongOverlayWindowManager.openWindow.start");
            const screen = Dimensions.get("screen");
            const windowDims = Dimensions.get("window");
            let screenWidth = DEFAULT_WIDTH;
            if (typeof screen.width === "number") {
                screenWidth = screen.width;
            } else if (typeof windowDims.width === "number") {
                screenWidth = windowDims.width;
            }
            let screenHeight = DEFAULT_HEIGHT;
            if (typeof screen.height === "number") {
                screenHeight = screen.height;
            } else if (typeof windowDims.height === "number") {
                screenHeight = windowDims.height;
            }

            let x = Math.max(Math.round((screenWidth - windowWidth) / 2), 0);
            if (horizontalPosition === "left") {
                x = OVERLAY_WINDOW_HORIZONTAL_MARGIN;
            } else if (horizontalPosition === "right") {
                x = Math.max(screenWidth - windowWidth - OVERLAY_WINDOW_HORIZONTAL_MARGIN, 0);
            }

            const maxY = Math.max(screenHeight - windowHeight, 0);
            const clampY = (value: number) => Math.min(Math.max(value, 0), maxY);

            let y = clampY(maxY - OVERLAY_WINDOW_TOP_MARGIN);
            if (verticalPosition === "middle") {
                y = clampY(Math.round(maxY / 2));
            } else if (verticalPosition === "bottom") {
                y = clampY(OVERLAY_WINDOW_BOTTOM_MARGIN);
            }

            let frameAnimationDurationMs: number | undefined;
            if (shouldAnimateFrameChange) {
                frameAnimationDurationMs = OVERLAY_WINDOW_ANIMATION_DURATION_MS;
            }

            await WindowsNavigator.open(OVERLAY_WINDOW_KEY, {
                x,
                y,
                animateFrameChange: shouldAnimateFrameChange,
                frameAnimationDurationMs,
                windowStyle: {
                    width: windowWidth,
                    height: windowHeight,
                    mask: [
                        WindowStyleMask.Borderless,
                        WindowStyleMask.NonactivatingPanel,
                        WindowStyleMask.FullSizeContentView,
                    ],
                },
            });
            previousDimensionsRef.current = { width: windowWidth, height: windowHeight };
        } catch (error) {
            console.error("Failed to open current song overlay window:", error);
            perfLog("CurrentSongOverlayWindowManager.openWindow.error", error);
        }
    });

    return null;
};

export const ensureOverlayWindowClosed = () => {
    cancelCurrentSongOverlay();
};
