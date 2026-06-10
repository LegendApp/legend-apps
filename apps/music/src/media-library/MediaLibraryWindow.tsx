import { PortalProvider } from "@gorhom/portal";
import { useValue } from "@legendapp/state/react";
import { getLegendThemeAppearance } from "@legend-desktop/theme";
import { useCallback, useState } from "react";
import type { LayoutChangeEvent, NativeSyntheticEvent } from "react-native";
import { Platform, View } from "react-native";
import { DragDropProvider } from "@/components/dnd";
import { MediaLibraryView } from "@/components/MediaLibrary";
import { MediaLibrarySidebar } from "@/components/MediaLibrary/Sidebar";
import { TrackList } from "@/components/MediaLibrary/TrackList";
import { TooltipProvider } from "@/components/TooltipProvider";
import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { HiddenTextInput } from "@/systems/keyboard/HookKeyboard";
import { normalizeMusicAppearanceSettings, settings$ } from "@/systems/Settings";
import { stateSaved$ } from "@/systems/State";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { WindowProvider } from "@/windows";

const MEDIA_LIBRARY_WINDOW_ID = "media-library";

export default function MediaLibraryWindow() {
    const isMacOS = Platform.OS === "macos";
    const appearanceSettings = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const splitViewAppearance = getLegendThemeAppearance(appearanceSettings.theme);
    const [paneWidths, setPaneWidths] = useState({ content: 0, sidebar: 0 });
    const [height, setHeight] = useState(0);
    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
            stateSaved$.libraryWindowSize.set({ width: Math.round(width), height: Math.round(height) });
            setHeight(Math.round(height));
        }
    }, []);
    const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
        const nextContentWidth = Math.round(event.nativeEvent.contentWidth);
        const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);
        if (nextContentWidth > 0 || nextSidebarWidth > 0) {
            setPaneWidths((current) => {
                const next = {
                    content: nextContentWidth > 0 ? nextContentWidth : current.content,
                    sidebar: nextSidebarWidth > 0 ? nextSidebarWidth : current.sidebar,
                };
                return current.content === next.content && current.sidebar === next.sidebar ? current : next;
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
                                    appearance={splitViewAppearance}
                                    className="flex-1 bg-background-primary"
                                    contentMinWidth={360}
                                    onLayout={handleLayout}
                                    onSplitViewDidResize={handleSplitViewResize}
                                    sidebarMinWidth={220}
                                    style={{ flex: 1 }}
                                >
                                    <View
                                        className="flex-1"
                                        style={{ flex: 1, minWidth: 0, width: paneWidths.sidebar || undefined }}
                                    >
                                        <MediaLibrarySidebar />
                                    </View>
                                    <View
                                        className="flex-1"
                                        style={{ flex: 1, minWidth: 0, width: paneWidths.content || undefined }}
                                    >
                                        <View
                                            className="flex-1"
                                            style={{
                                                height: height ? height : undefined,
                                                minHeight: height ? height : undefined,
                                            }}
                                        >
                                            <TrackList />
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
