import { PortalProvider } from "@gorhom/portal";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, type LayoutChangeEvent, type NativeSyntheticEvent, View } from "react-native";
import { NativeSidebar } from "@/components/NativeSidebar";
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

type PaneLayout = {
    contentWidth: number;
    height: number;
    sidebarWidth: number;
};

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
    const [paneLayout, setPaneLayout] = useState<PaneLayout>({ contentWidth: 0, height: 0, sidebarWidth: 0 });

    const nativeItems = useMemo(() => {
        return SETTING_PAGES.map((item) => ({ id: item.id, label: item.name }));
    }, []);

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

    const handleLayout = useCallback((event: LayoutChangeEvent) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (nextHeight > 0) {
            setPaneLayout((current) => {
                const height = Math.round(nextHeight);
                if (current.height === height) {
                    return current;
                }

                return { ...current, height };
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
        <View className="flex-1" style={{ flex: 1 }}>
            <ThemeProvider>
                <PortalProvider>
                    <TooltipProvider>
                        {isMacOS ? (
                            <SidebarSplitView
                                className="flex-1 bg-background-primary"
                                contentMinWidth={360}
                                onLayout={handleLayout}
                                onSplitViewDidResize={handleSplitViewResize}
                                sidebarMinWidth={180}
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
                                    <NativeSidebar
                                        items={nativeItems}
                                        selectedId={selectedItem}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                </View>
                                <View
                                    className="flex-1"
                                    style={{
                                        flex: 1,
                                        width: paneLayout.contentWidth || undefined,
                                        minHeight: paneLayout.height || undefined,
                                        height: paneLayout.height || undefined,
                                    }}
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
