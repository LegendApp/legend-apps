import { PortalProvider } from "@gorhom/portal";
import { useMount } from "@legendapp/state/react";
import type React from "react";
import { useRef } from "react";
import { LogBox, StyleSheet, View } from "react-native";
import { DragDropProvider } from "@/components/dnd";
import { MainContainer } from "@/components/MainContainer";
import { TitleBar } from "@/components/TitleBar";
import { ToastProvider } from "@/components/Toast";
import { TooltipProvider } from "@/components/TooltipProvider";
import { MediaLibraryWindowManager } from "@/media-library/MediaLibraryWindowManager";
import { CurrentSongOverlayController } from "@/overlay/CurrentSongOverlayController";
import { CurrentSongOverlayWindowManager } from "@/overlay/CurrentSongOverlayWindowManager";
import { SettingsWindowManager } from "@/settings/SettingsWindowManager";
import { GlobalHotkeyManager } from "@/systems/GlobalHotkey";
import { AppMenuController } from "@/systems/AppMenu";
import { HookKeyboard } from "@/systems/keyboard/HookKeyboard";
import { hydrateLibraryFromCache } from "@/systems/LibraryState";
import { initializeLocalMusic } from "@/systems/LocalMusicState";
import { perfCount, perfMark } from "@/utils/perfLogger";
import { runAfterInteractionsWithLabel } from "@/utils/runAfterInteractions";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { WindowsNavigator } from "@/windows";
import { WindowProvider } from "@/windows/WindowProvider";

LogBox.ignoreLogs(["Open debugger", "unknown error"]);

perfMark("App.moduleLoad");

function App(): React.JSX.Element {
    perfCount("App.render");
    const hasLoggedFirstLayout = useRef(false);

    useMount(() => {
        const initializeHandle = runAfterInteractionsWithLabel(() => {
            initializeLocalMusic();
        }, "App.initializeLocalMusic");

        const hydrateHandle = runAfterInteractionsWithLabel(() => {
            try {
                hydrateLibraryFromCache();
            } catch (error) {
                console.warn("Failed to hydrate library cache:", error);
            }
        }, "App.hydrateLibrary");

        const prefetchHandle = runAfterInteractionsWithLabel(() => {
            void WindowsNavigator.prefetch("SettingsWindow").catch((error) => {
                console.warn("Failed to prefetch settings window:", error);
            });
            void WindowsNavigator.prefetch("MediaLibraryWindow").catch((error) => {
                console.warn("Failed to prefetch media library window:", error);
            });
            void WindowsNavigator.prefetch("CurrentSongOverlayWindow").catch((error) => {
                console.warn("Failed to prefetch current song overlay window:", error);
            });
        }, "App.prefetchWindows");

        return () => {
            initializeHandle.cancel();
            hydrateHandle.cancel();
            prefetchHandle.cancel();
        };
    });

    const handleFirstLayout = () => {
        if (!hasLoggedFirstLayout.current) {
            hasLoggedFirstLayout.current = true;
            perfMark("App.firstLayout");
        }
    };

    return (
        <WindowProvider id="main">
            <ThemeProvider>
                <HookKeyboard />
                <GlobalHotkeyManager />
                <AppMenuController />
                <View className="flex-1" style={styles.root} onLayout={handleFirstLayout}>
                    <PortalProvider>
                        <ToastProvider />
                        <TooltipProvider>
                            <DragDropProvider>
                                <MainContainer />
                            </DragDropProvider>
                        </TooltipProvider>
                    </PortalProvider>
                </View>
                <TitleBar />
                <MediaLibraryWindowManager />
                <SettingsWindowManager />
                <CurrentSongOverlayWindowManager />
                <CurrentSongOverlayController />
            </ThemeProvider>
        </WindowProvider>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
    },
});

export default App;
