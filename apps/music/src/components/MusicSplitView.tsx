import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { useValue } from "@legendapp/state/react";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";

export function MusicSplitView({ id, sidebar, content }: { id: string; sidebar: ReactNode; content: ReactNode }) {
    const appearance = normalizeMusicAppearanceSettings(useValue(settings$.appearance)).theme;
    const [sidebarWidth] = useState(() => Math.max(80, settings$.state.panels[id].peek() ?? 200));
    return (
        <SidebarSplitView
            appearance={appearance}
            style={{ flex: 1 }}
            sidebarMinWidth={80}
            contentMinWidth={80}
            sidebarWidth={sidebarWidth}
            onResize={event => {
                if (event.phase === "ready") settings$.state.panels[id].set(event.sidebarWidth);
            }}
            sidebar={<View style={{ flex: 1, minWidth: 0 }}>{sidebar}</View>}
            content={<View style={{ flex: 1, minWidth: 0 }}>{content}</View>}
        />
    );
}
