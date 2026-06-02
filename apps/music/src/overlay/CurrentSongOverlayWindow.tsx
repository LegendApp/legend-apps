import { PortalProvider } from "@gorhom/portal";
import { GlassEffectView } from "@legend-desktop/glass-effect-view";
import { useObserveEffect } from "@legendapp/state/react";
import { useCallback, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { PlaybackArea } from "@/components/PlaybackArea";
import { TooltipProvider } from "@/components/TooltipProvider";
import { setWindowBlur } from "@legend-desktop/window-manager";
import { IS_TAHOE } from "@/systems/constants";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { withWindowProvider } from "@/windows";
import {
    currentSongOverlay$,
    finalizeCurrentSongOverlayDismissal,
    pauseCurrentSongOverlayDismissal,
    resetCurrentSongOverlayTimer,
    setCurrentSongOverlayWindowHeight,
    setCurrentSongOverlayWindowWidth,
} from "./CurrentSongOverlayState";
import {
    OVERLAY_WINDOW_HEIGHT_COMPACT,
    OVERLAY_WINDOW_HIDE_DURATION_MS,
    OVERLAY_WINDOW_MAX_BLUR_RADIUS,
    OVERLAY_WINDOW_ROOT_PADDING_BOTTOM,
    OVERLAY_WINDOW_ROOT_PADDING_TOP,
    OVERLAY_WINDOW_SHOW_DURATION_MS,
    OVERLAY_WINDOW_WIDTH_COMPACT,
} from "./OverlayConstants";

const WINDOW_ID = "current-song-overlay";
const BORDER_RADIUS = IS_TAHOE ? 20 : 16;
const styles = StyleSheet.create({
    root: {
        alignSelf: "stretch",
        flex: 1,
        paddingTop: OVERLAY_WINDOW_ROOT_PADDING_TOP,
        paddingHorizontal: 30,
        paddingBottom: OVERLAY_WINDOW_ROOT_PADDING_BOTTOM,
        backgroundColor: "transparent",
    },
    shadowContainer: {
        flex: 1,
        borderRadius: BORDER_RADIUS,
        shadowColor: "#000000",
        shadowOffset: { width: 1, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        alignSelf: "stretch",
        width: "100%",
    },
    overlayWrapper: {
        flex: 1,
        borderRadius: BORDER_RADIUS,
        overflow: "hidden",
        alignSelf: "stretch",
        width: "100%",
    },
    overlaySurface: {
        flex: 1,
        borderRadius: BORDER_RADIUS,
        borderWidth: 1,
        borderColor: "#AAABAB26",
        overflow: "hidden",
        alignSelf: "stretch",
        width: "100%",
    },
});

function CurrentSongOverlayWindow() {
    const [isHovered, setIsHovered] = useState(false);

    const handleExitComplete = useCallback(() => {
        finalizeCurrentSongOverlayDismissal();
    }, []);

    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
        pauseCurrentSongOverlayDismissal();
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        if (currentSongOverlay$.isExiting.peek()) {
            return;
        }
        resetCurrentSongOverlayTimer();
    }, []);

    useObserveEffect(() => {
        if (currentSongOverlay$.isExiting.get()) {
            return;
        }

        setCurrentSongOverlayWindowHeight(OVERLAY_WINDOW_HEIGHT_COMPACT);
        setCurrentSongOverlayWindowWidth(OVERLAY_WINDOW_WIDTH_COMPACT);
    });

    useObserveEffect(async () => {
        const exiting = currentSongOverlay$.isExiting.get();
        const windowOpen = currentSongOverlay$.isWindowOpen.peek();

        if (exiting) {
            try {
                setWindowBlur(WINDOW_ID, OVERLAY_WINDOW_MAX_BLUR_RADIUS, OVERLAY_WINDOW_HIDE_DURATION_MS);
            } catch (error) {
                console.error("Failed to animate overlay blur on hide:", error);
            }

            setTimeout(handleExitComplete, OVERLAY_WINDOW_HIDE_DURATION_MS);

            return;
        }

        if (!windowOpen) {
            return;
        }

        if (Platform.OS === "macos") {
            try {
                await setWindowBlur(WINDOW_ID, OVERLAY_WINDOW_MAX_BLUR_RADIUS, 0);
                await setWindowBlur(WINDOW_ID, 0, OVERLAY_WINDOW_SHOW_DURATION_MS);
            } catch {}
        }
    });

    const mouseHandlers = {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
    } as object;

    return (
        <View style={styles.root} {...mouseHandlers}>
            <View style={styles.shadowContainer}>
                <View style={styles.overlayWrapper}>
                    <GlassEffectView glassStyle="regular" tintColor="#00000022" style={styles.overlaySurface}>
                        <View className="flex-1 bg-black/10">
                            <ThemeProvider>
                                <PortalProvider>
                                    <TooltipProvider>
                                        <PlaybackArea
                                            showBorder={false}
                                            overlayMode={{ enabled: true, showControls: isHovered }}
                                        />
                                    </TooltipProvider>
                                </PortalProvider>
                            </ThemeProvider>
                        </View>
                    </GlassEffectView>
                </View>
            </View>
        </View>
    );
}

export default withWindowProvider(CurrentSongOverlayWindow, WINDOW_ID);
