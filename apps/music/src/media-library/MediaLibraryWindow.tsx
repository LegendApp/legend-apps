import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import { useCallback, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { Platform, Text, View } from "react-native";
import { DragDropProvider } from "@/components/dnd";
import { MediaLibraryView } from "@/components/MediaLibrary";
import { MediaLibrarySidebar } from "@/components/MediaLibrary/Sidebar";
import { TrackList } from "@/components/MediaLibrary/TrackList";
import { TooltipProvider } from "@/components/TooltipProvider";
import { AppKitSplitView } from "@legend-desktop/appkit-split-view";
import { HiddenTextInput } from "@/systems/keyboard/HookKeyboard";
import { settings$ } from "@/systems/Settings";
import { stateSaved$ } from "@/systems/State";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { WindowProvider } from "@/windows";

const MEDIA_LIBRARY_WINDOW_ID = "media-library";

export default function MediaLibraryWindow() {
    const showHints = useValue(settings$.general.showHints);
    const isMacOS = Platform.OS === "macos";
    const [height, setHeight] = useState(0);
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            stateSaved$.libraryWindowSize.set({ width: Math.round(width), height: Math.round(height) });

            setHeight(height);
        }
    }, []);

    return (
        <WindowProvider id={MEDIA_LIBRARY_WINDOW_ID}>
            <ThemeProvider>
                <HiddenTextInput />
                <PortalProvider>
                    {/* <View className="flex-1 bg-background-primary/60 min-h-full" onLayout={handleLayout}> */}
                    <TooltipProvider>
                        <DragDropProvider>
                            {isMacOS ? (
                                <AppKitSplitView className="flex-1 bg-background-primary" onLayout={handleLayout}>
                                    <MediaLibrarySidebar useNativeLibraryList />
                                    <View className="flex-1">
                                        <View
                                            className="flex-1"
                                            style={{
                                                minHeight: height ? height : undefined,
                                                height: height ? height : undefined,
                                            }}
                                        >
                                            <TrackList />
                                            {/* {showHints ? (
                                                <View className="border-t border-white/15 bg-black/20 px-3 py-2">
                                                    <Text className="text-xs text-white/60">
                                                        Shift click to play next
                                                    </Text>
                                                </View>
                                            ) : null} */}
                                        </View>
                                    </View>
                                </AppKitSplitView>
                            ) : (
                                <MediaLibraryView />
                            )}
                        </DragDropProvider>
                    </TooltipProvider>
                    {/* </View> */}
                </PortalProvider>
            </ThemeProvider>
        </WindowProvider>
    );
}
