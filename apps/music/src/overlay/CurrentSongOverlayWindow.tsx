import { PortalProvider } from "@gorhom/portal";
import { GlassView } from "@legendapp/spark/ui/glass";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { PlaybackArea } from "../components/PlaybackArea";
import { TooltipProvider } from "../components/TooltipProvider";
import { setWindowBlur } from "@legendapp/spark/windows/macos";
import { IS_TAHOE } from "../systems/constants";
import { ThemeProvider } from "../theme/ThemeProvider";
import { withWindowProvider } from "../windows";
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
    OVERLAY_WINDOW_HEIGHT_EXPANDED,
    OVERLAY_WINDOW_WIDTH_EXPANDED,
    OVERLAY_WINDOW_INITIAL_SCALE,
    OVERLAY_WINDOW_SPRING_DAMPING,
    OVERLAY_WINDOW_SPRING_STIFFNESS,
    OVERLAY_WINDOW_SPRING_MASS,
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
    const exiting = useValue(currentSongOverlay$.isExiting);
    const windowOpen = useValue(currentSongOverlay$.isWindowOpen);
    const presentationId = useValue(currentSongOverlay$.presentationId);
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(OVERLAY_WINDOW_INITIAL_SCALE)).current;

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

    useEffect(() => {
        if (exiting) return;
        setCurrentSongOverlayWindowHeight(isHovered ? OVERLAY_WINDOW_HEIGHT_EXPANDED : OVERLAY_WINDOW_HEIGHT_COMPACT);
        setCurrentSongOverlayWindowWidth(isHovered ? OVERLAY_WINDOW_WIDTH_EXPANDED : OVERLAY_WINDOW_WIDTH_COMPACT);
    }, [exiting, isHovered]);

    useEffect(() => {
        if (!windowOpen) return;
        if (!exiting) {
            opacity.setValue(0);
            scale.setValue(OVERLAY_WINDOW_INITIAL_SCALE);
        }
        const fade = Animated.timing(opacity, {
            toValue: exiting ? 0 : 1,
            duration: exiting ? OVERLAY_WINDOW_HIDE_DURATION_MS : OVERLAY_WINDOW_SHOW_DURATION_MS,
            easing: exiting ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
            useNativeDriver: true,
        });
        const animation = exiting ? fade : Animated.parallel([
            fade,
            Animated.spring(scale, {
                toValue: 1,
                damping: OVERLAY_WINDOW_SPRING_DAMPING,
                stiffness: OVERLAY_WINDOW_SPRING_STIFFNESS,
                mass: OVERLAY_WINDOW_SPRING_MASS,
                useNativeDriver: true,
            }),
        ]);
        animation.start(({ finished }) => {
            if (finished && exiting) handleExitComplete();
        });
        if (Platform.OS === "macos") {
            if (exiting) {
                void setWindowBlur(WINDOW_ID, { radius: OVERLAY_WINDOW_MAX_BLUR_RADIUS, durationMs: OVERLAY_WINDOW_HIDE_DURATION_MS }).catch(console.error);
            } else {
                void setWindowBlur(WINDOW_ID, { radius: OVERLAY_WINDOW_MAX_BLUR_RADIUS, durationMs: 0 })
                    .then(() => setWindowBlur(WINDOW_ID, { radius: 0, durationMs: OVERLAY_WINDOW_SHOW_DURATION_MS }))
                    .catch(console.error);
            }
        }
        return () => animation.stop();
    }, [exiting, windowOpen, presentationId, opacity, scale, handleExitComplete]);

    const mouseHandlers = {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
    } as object;

    return (
        <Animated.View style={[styles.root, { opacity, transform: [{ scale }] }]} {...mouseHandlers}>
            <View style={styles.shadowContainer}>
                <View style={styles.overlayWrapper}>
                    <GlassView glassStyle="regular" tintColor="#00000022" style={styles.overlaySurface}>
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
                    </GlassView>
                </View>
            </View>
        </Animated.View>
    );
}

export default withWindowProvider(CurrentSongOverlayWindow, WINDOW_ID);
