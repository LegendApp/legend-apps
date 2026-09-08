import { getLegendDisplayTheme } from "@legend-apps/theme";
import type { WindowStyleOptions } from "@legend-apps/window-manager";
import type { MusicTheme } from "../theme/musicThemes";

export function createLibraryWindowStyle(theme: MusicTheme): WindowStyleOptions {
  // The library panes use the shared Uniwind background tokens.
  const { colors } = getLegendDisplayTheme(theme.appearance);
  return {
    appearance: theme.appearance,
    backgroundColor: theme.colors.background.secondary,
    contentLayoutMode: "fullSize",
    // Clear legacy unified toolbar metrics when restoring this toolbarless window.
    toolbarStyle: "automatic",
    startupSplitView: {
      appearance: theme.appearance,
      backgroundColor: colors.background,
      sidebarBackgroundColor: colors.surface,
      sidebarWidth: 220,
      sidebarMinWidth: 220,
      contentMinWidth: 360,
    },
  };
}
