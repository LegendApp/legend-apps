import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import { useCallback, useState } from "react";
import type { LayoutChangeEvent, NativeSyntheticEvent } from "react-native";
import { Platform, Text, View } from "react-native";
import { DragDropProvider } from "@/components/dnd";
import { MediaLibraryView } from "@/components/MediaLibrary";
import { MediaLibrarySidebar } from "@/components/MediaLibrary/Sidebar";
import { TrackList } from "@/components/MediaLibrary/TrackList";
import { TooltipProvider } from "@/components/TooltipProvider";
import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { HiddenTextInput } from "@/systems/keyboard/HookKeyboard";
import { settings$ } from "@/systems/Settings";
import { stateSaved$ } from "@/systems/State";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { WindowProvider } from "@/windows";

const MEDIA_LIBRARY_WINDOW_ID = "media-library";

type PaneLayout = {
    contentWidth: number;
    height: number;
    sidebarWidth: number;
};

export default function MediaLibraryWindow() {
    const showHints = useValue(settings$.general.showHints);
    const isMacOS = Platform.OS === "macos";
    const [paneLayout, setPaneLayout] = useState<PaneLayout>({ contentWidth: 0, height: 0, sidebarWidth: 0 });
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            stateSaved$.libraryWindowSize.set({ width: Math.round(width), height: Math.round(height) });

            setPaneLayout((current) => {
                const nextHeight = Math.round(height);
                if (current.height === nextHeight) {
                    return current;
                }

                return { ...current, height: nextHeight };
            });
        }
    }, []);
    const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
        const { contentWidth, sidebarWidth } = event.nativeEvent;
        if (contentWidth > 0 && sidebarWidth > 0) {
            setPaneLayout((current) => {
                const nextLayout = {
                    contentWidth: Math.round(contentWidth),
                    height: current.height,
                    sidebarWidth: Math.round(sidebarWidth),
                };

                if (
                    current.contentWidth === nextLayout.contentWidth &&
                    current.height === nextLayout.height &&
                    current.sidebarWidth === nextLayout.sidebarWidth
                ) {
                    return current;
                }

                return nextLayout;
            });
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
                                <SidebarSplitView
                                    className="flex-1 bg-background-primary"
                                    contentMinWidth={360}
                                    onLayout={handleLayout}
                                    onSplitViewDidResize={handleSplitViewResize}
                                    sidebarMinWidth={220}
                                    style={{ flex: 1 }}
                                >
                                    <View
                                        className="flex-1"
                                        style={{
                                            width: paneLayout.sidebarWidth || undefined,
                                            minHeight: paneLayout.height || undefined,
                                            height: paneLayout.height || undefined,
                                        }}
                                    >
                                        <MediaLibrarySidebar useNativeLibraryList />
                                    </View>
                                    <View
                                        className="flex-1"
                                        style={{
                                            width: paneLayout.contentWidth || undefined,
                                            minHeight: paneLayout.height || undefined,
                                            height: paneLayout.height || undefined,
                                        }}
                                    >
                                        <View
                                            className="flex-1"
                                            style={{
                                                minHeight: paneLayout.height || undefined,
                                                height: paneLayout.height || undefined,
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
                                </SidebarSplitView>
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
