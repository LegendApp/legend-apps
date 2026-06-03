import { PortalProvider } from "@gorhom/portal";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, Text, View, type NativeSyntheticEvent } from "react-native";
import { Button } from "@/components/Button";
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
import { cn } from "@/utils/cn";

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

const MACOS_SIDEBAR_TOP_INSET = 52;

interface SettingsSidebarContentProps {
    selectedItem: SettingsPage;
    onSelectionChange: (id: string) => void;
}

function SettingsSidebarContent({ selectedItem, onSelectionChange }: SettingsSidebarContentProps) {
    return (
        <View className="flex-1 min-h-0">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{
                    paddingHorizontal: 8,
                    paddingTop: MACOS_SIDEBAR_TOP_INSET,
                }}
                showsVerticalScrollIndicator={false}
            >
                {SETTING_PAGES.map((item) => {
                    const isSelected = selectedItem === item.id;
                    return (
                        <Button
                            key={item.id}
                            className={cn(
                                "h-7 justify-center rounded-md px-2",
                                isSelected ? "bg-white/10" : "hover:bg-white/10 active:bg-white/15",
                            )}
                            onClick={() => onSelectionChange(item.id)}
                        >
                            <Text
                                className={cn(
                                    isSelected ? "text-text-primary font-medium" : "text-text-secondary",
                                )}
                                numberOfLines={1}
                                style={{ fontSize: 13 }}
                            >
                                {item.name}
                            </Text>
                        </Button>
                    );
                })}
            </ScrollView>
        </View>
    );
}

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
    const [paneMetrics, setPaneMetrics] = useState({ contentWidth: 0, height: 0, sidebarWidth: 0 });

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
        const nextHeight = Math.round(event.nativeEvent.height);
        const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);
        if (nextContentWidth > 0 || nextHeight > 0 || nextSidebarWidth > 0) {
            setPaneMetrics((current) => {
                const next = {
                    contentWidth: nextContentWidth > 0 ? nextContentWidth : current.contentWidth,
                    height: nextHeight > 0 ? nextHeight : current.height,
                    sidebarWidth: nextSidebarWidth > 0 ? nextSidebarWidth : current.sidebarWidth,
                };
                return current.contentWidth === next.contentWidth &&
                    current.height === next.height &&
                    current.sidebarWidth === next.sidebarWidth
                    ? current
                    : next;
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
                                onSplitViewDidResize={handleSplitViewResize}
                                sidebarMinWidth={180}
                                style={{ flex: 1 }}
                            >
                                <View
                                    className="flex-1"
                                    style={{
                                        flex: 1,
                                        height: paneMetrics.height || undefined,
                                        minHeight: paneMetrics.height || undefined,
                                        minWidth: 0,
                                        width: paneMetrics.sidebarWidth || undefined,
                                    }}
                                >
                                    <SettingsSidebarContent
                                        selectedItem={selectedItem}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                </View>
                                <View
                                    className="flex-1"
                                    style={{
                                        flex: 1,
                                        height: paneMetrics.height || undefined,
                                        minHeight: paneMetrics.height || undefined,
                                        minWidth: 0,
                                        width: paneMetrics.contentWidth || undefined,
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
