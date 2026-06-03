import { PortalProvider } from "@gorhom/portal";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useState } from "react";
import { Platform, Text, View, type NativeSyntheticEvent } from "react-native";
import { NativeSidebar, SidebarItem } from "@/components/NativeSidebar";
import { Sidebar } from "@/components/Sidebar";
import { TooltipProvider } from "@/components/TooltipProvider";
import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { setWindowTitle } from "@legend-desktop/window-manager";
import { AccountSettings } from "@/settings/AccountSettings";
import { CustomizeUISettings } from "@/settings/CustomizeUISettings";
import { GeneralSettings } from "@/settings/GeneralSettings";
import { LibrarySettings } from "@/settings/LibrarySettings";
import { OpenSourceSettings } from "@/settings/OpenSourceSettings";
import { OverlaySettings } from "@/settings/OverlaySettings";
import { ThemeSettings } from "@/settings/ThemeSettings";
import { SUPPORT_ACCOUNTS } from "@/systems/constants";
import { state$ } from "@/systems/State";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { ax } from "@/utils/ax";

export type SettingsPage = "general" | "library" | "overlay" | "theme" | "ui-customize" | "account" | "open-source";

// Define the categories for settings
const SETTING_PAGES: { id: SettingsPage; name: string }[] = ax([
    { id: "general", name: "General" },
    { id: "library", name: "Library" },
    { id: "overlay", name: "Overlay" },
    { id: "theme", name: "Theme" },
    { id: "ui-customize", name: "Customize UI" },
    SUPPORT_ACCOUNTS && { id: "account", name: "Account" },
    { id: "open-source", name: "Open Source" },
]);

function Content({ selectedItem$ }: { selectedItem$: Observable<SettingsPage> }) {
    const selectedItem = useValue(selectedItem$);

    switch (selectedItem) {
        case "general":
            return <GeneralSettings />;
        case "library":
            return <LibrarySettings />;
        case "overlay":
            return <OverlaySettings />;
        case "theme":
            return <ThemeSettings />;
        case "ui-customize":
            return <CustomizeUISettings />;
        case "open-source":
            return <OpenSourceSettings />;
        case "account":
            return <AccountSettings />;
        default:
            return null;
    }
}

export default function SettingsContainer() {
    const showSettingsPage = useValue(state$.showSettingsPage);
    const selectedItem$ = useObservable<SettingsPage>(showSettingsPage || "general");
    const selectedItem = useValue(selectedItem$);
    const isMacOS = Platform.OS === "macos";
    const [contentWidth, setContentWidth] = useState(0);

    useEffect(() => {
        const pageName = SETTING_PAGES.find((page) => page.id === selectedItem)?.name ?? "Settings";
        setWindowTitle("settings", pageName);
    }, [selectedItem]);

    const handleSelectionChange = useCallback(
        (id: string) => {
            selectedItem$.set(id as SettingsPage);
        },
        [selectedItem$],
    );
    const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
        const nextContentWidth = Math.round(event.nativeEvent.contentWidth);
        if (nextContentWidth > 0) {
            setContentWidth((current) => (current === nextContentWidth ? current : nextContentWidth));
        }
    }, []);

    return (
        <View className="flex-1" style={{ flex: 1 }}>
            <ThemeProvider>
                <PortalProvider>
                    <TooltipProvider>
                        {isMacOS ? (
                            <SidebarSplitView
                                className="flex-1 bg-background-primary"
                                contentMinWidth={360}
                                onSplitViewDidResize={handleSplitViewResize}
                                sidebarMinWidth={180}
                                style={{ flex: 1 }}
                            >
                                <NativeSidebar
                                    className="flex-1 h-full"
                                    selectedId={selectedItem}
                                    onSelectionChange={handleSelectionChange}
                                >
                                    {SETTING_PAGES.map((item) => (
                                        <SidebarItem key={item.id} itemId={item.id}>
                                            <Text className="text-sm text-text-primary">{item.name}</Text>
                                        </SidebarItem>
                                    ))}
                                </NativeSidebar>
                                <View
                                    className="flex-1"
                                    style={{ flex: 1, minWidth: 0, width: contentWidth || undefined }}
                                >
                                    <Content selectedItem$={selectedItem$} />
                                </View>
                            </SidebarSplitView>
                        ) : (
                            <View className="flex flex-1 flex-row">
                                <Sidebar
                                    items={SETTING_PAGES}
                                    selectedItem$={selectedItem$}
                                    width={140}
                                    className="py-2"
                                />
                                <View className="flex-1">
                                    <Content selectedItem$={selectedItem$} />
                                </View>
                            </View>
                        )}
                    </TooltipProvider>
                </PortalProvider>
            </ThemeProvider>
        </View>
    );
}
