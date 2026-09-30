import { getLegendDisplayTheme } from "@legend-apps/theme";
import type { NavigatorWindowOptions } from "@legendapp/spark/windows";
import type { MusicTheme } from "../theme/musicThemes";
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
                sidebarWidth: 220,
                sidebarMinWidth: 220,
                contentMinWidth: 360,
            },
            titleBar: {
                contentLayout: "fullSize"
            },
            toolbar: {
                style: "automatic"
            }
        }
    };
}
