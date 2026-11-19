import { getLegendDisplayTheme } from "@legend-apps/theme";
import type { NavigatorWindowOptions } from "@legendapp/spark/windows";
import type { MusicTheme } from "../theme/musicThemes";

export const LIBRARY_SIDEBAR_WIDTH = 220;
export const MEDIA_LIBRARY_DEFAULT_WIDTH = 640;
export const MEDIA_LIBRARY_DEFAULT_HEIGHT = 600;
const SPLIT_DIVIDER_WIDTH = 1;

// The window opens at the saved size; sizing the panes from it keeps the track list bounded until AppKit reports its own metrics.
export function getLibraryInitialPaneMetrics({ width, height }: { width: number; height: number }) {
    const windowWidth = width > 0 ? width : MEDIA_LIBRARY_DEFAULT_WIDTH;
    const windowHeight = height > 0 ? height : MEDIA_LIBRARY_DEFAULT_HEIGHT;
    return {
        sidebarWidth: LIBRARY_SIDEBAR_WIDTH,
        sidebarHeight: windowHeight,
        contentWidth: Math.max(0, windowWidth - LIBRARY_SIDEBAR_WIDTH - SPLIT_DIVIDER_WIDTH),
        contentHeight: windowHeight,
    };
}

export function createLibraryWindowStyle(theme: MusicTheme): NavigatorWindowOptions {
    // The library panes use the shared Uniwind background tokens.
    const { colors } = getLegendDisplayTheme(theme.appearance);
    return {
        appearance: theme.appearance,
        backgroundColor: theme.colors.background.secondary,
        macos: {
            startupSplitView: {
                appearance: theme.appearance,
                backgroundColor: colors.background,
                sidebarBackgroundColor: colors.surface,
                sidebarWidth: LIBRARY_SIDEBAR_WIDTH,
                sidebarMinWidth: LIBRARY_SIDEBAR_WIDTH,
                contentMinWidth: 360,
            },
            // Window open and restyle calls replace the registered macOS options, so keep the whole title bar here.
            titleBar: {
                contentLayout: "fullSize",
                transparent: true,
                titleVisibility: "hidden",
            },
            toolbar: {
                style: "automatic"
            }
        }
    };
}
