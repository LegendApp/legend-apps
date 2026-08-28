import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import {
    SidebarSplitView,
    sidebarSplitViewTitlebarMetrics,
} from "@legend-apps/appkit-split-view";
import { setWindowOptions, showWindow } from "@legend-apps/window-manager";
import { useCallback, useEffect, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Platform, StyleSheet, View } from "react-native";
import { DragDropProvider } from "../components/dnd";
import { MediaLibraryView } from "../components/MediaLibrary";
import { MediaLibrarySidebar } from "../components/MediaLibrary/Sidebar";
import { TrackList } from "../components/MediaLibrary/TrackList";
import { ToastProvider } from "../components/Toast";
import { TooltipProvider } from "../components/TooltipProvider";
import { HiddenTextInput } from "../systems/keyboard/HookKeyboard";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { stateSaved$ } from "../systems/State";
import { ThemeProvider } from "../theme/ThemeProvider";
import { getMusicTheme } from "../theme/musicThemes";
import { WindowProvider, WindowsNavigator } from "../windows";

const MEDIA_LIBRARY_WINDOW_ID = WindowsNavigator.getIdentifier("MediaLibraryWindow");

export default function MediaLibraryWindow() {
    const isMacOS = Platform.OS === "macos";
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const musicTheme = getMusicTheme(appearanceSettings.theme);
    const windowShownRef = useRef(false);
    const updateWindowStyle = useCallback(() => setWindowOptions(MEDIA_LIBRARY_WINDOW_ID, {
        windowStyle: {
            appearance: musicTheme.appearance,
            backgroundColor: musicTheme.colors.background.secondary,
            contentLayoutMode: "fullSize",
        },
    }), [musicTheme.appearance, musicTheme.colors.background.secondary]);
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            stateSaved$.libraryWindowSize.set({ width: Math.round(width), height: Math.round(height) });
        }
    }, []);
    const handleSplitViewReady = useCallback(() => {
        if (!windowShownRef.current) {
            windowShownRef.current = true;
            updateWindowStyle()
                .then(() => showWindow(MEDIA_LIBRARY_WINDOW_ID))
                .catch((error: unknown) => {
                    windowShownRef.current = false;
                    console.error("Failed to show media library window:", error);
                });
        }
    }, [updateWindowStyle]);

    useEffect(() => {
        updateWindowStyle().catch((error: unknown) => {
            console.error("Failed to update media library window style:", error);
        });
    }, [updateWindowStyle]);
    return (
        <WindowProvider id={MEDIA_LIBRARY_WINDOW_ID}>
            <ThemeProvider>
                <HiddenTextInput />
                <PortalProvider>
                    <TooltipProvider>
                        <DragDropProvider>
                            {isMacOS ? (
                                <SidebarSplitView
                                    appearance={musicTheme.appearance}
                                    className="flex-1 bg-background-primary"
                                    contentMinWidth={360}
                                    onLayout={handleLayout}
                                    onSplitViewDidResize={handleSplitViewReady}
                                    sidebarMinWidth={220}
                                    style={styles.root}
                                >
                                    <View
                                        className="min-w-0 flex-1 bg-background-secondary"
                                        style={styles.sidebarPane}
                                    >
                                        <MediaLibrarySidebar />
                                    </View>
                                    <View className="min-w-0 flex-1 bg-background-primary">
                                        <ToastProvider>
                                            <TrackList />
                                        </ToastProvider>
                                    </View>
                                </SidebarSplitView>
                            ) : (
                                <MediaLibraryView />
                            )}
                        </DragDropProvider>
                    </TooltipProvider>
                </PortalProvider>
            </ThemeProvider>
        </WindowProvider>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
    sidebarPane: {
        paddingTop: sidebarSplitViewTitlebarMetrics.sidebarInsetTop,
    },
});
