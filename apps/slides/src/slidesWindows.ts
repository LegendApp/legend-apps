import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, type WindowsConfig } from "@legendapp/spark/windows";
import { createPresenterToolbarItems } from "./presenterToolbar";
import { openOrShowWindow } from "@legend-apps/runtime-utils";
export const slidesSettingsWindowIdentifier = "slides-settings";
const windows = {
    SlidesPresenterWindow: {
        id: "slides-presenter",
        loadComponent: () => import("./PresenterWindow").then((module) => module.PresenterWindow),
        options: {
            title: "Legend Slides",
            ...{
                appearance: "dark",
                backgroundColor: "#171819",
                size: {
                    height: 820,
                    width: 1280
                },
                minSize: {
                    height: 600,
                    width: 900
                },
                macos: {
                    titleBar: {
                        transparent: true,
                        material: "hudWindow",
                        blendingMode: "withinWindow",
                        materialState: "active",
                        separator: "none"
                    },
                    toolbar: {
                        visible: true,
                        items: createPresenterToolbarItems({
                            audienceOpen: false,
                            displays: [],
                            elapsed: 0,
                            hasDeck: false,
                            rehearsalEnabled: false,
                            selectedDisplayId: null,
                            timerRunning: false,
                        }),
                        style: "unifiedCompact"
                    }
                }
            }
        },
    },
    SlidesAudienceWindow: {
        id: "slides-audience",
        loadComponent: () => import("./AudienceWindow").then((module) => module.AudienceWindow),
        options: {
            title: "Legend Slides — Audience",
            ...{
                size: {
                    height: 720,
                    width: 1280
                },
                minSize: {
                    height: 360,
                    width: 640
                }
            }
        },
    },
    SlidesNotesWindow: {
        id: "slides-notes",
        loadComponent: () => import("./NotesWindow").then(module => module.NotesWindow),
        options: {
            title: "Legend Slides — Notes",
            ...{
                appearance: "dark",
                size: {
                    width: 1000,
                    height: 900
                },
                minSize: {
                    width: 600,
                    height: 500
                }
            }
        },
    },
    SlidesIdentifyWindow: {
        id: "slides-identify",
        loadComponent: () => import("./NotesWindow").then(module => module.IdentifyWindow),
        options: {
            title: "Identify Display",
            ...{
                appearance: "dark",
                size: {
                    width: 300,
                    height: 220
                }
            }
        },
    },
    SlidesSettingsWindow: {
        id: slidesSettingsWindowIdentifier,
        loadComponent: () => import("./SettingsWindow").then((module) => module.SettingsWindow),
        options: createSettingsWindowOptions({
            title: "Settings",
            ...{
                appearance: "dark"
            }
        }),
    },
} satisfies WindowsConfig;
export const slidesWindows = createWindowsNavigator(windows);
export function openSlidesSettingsWindow() {
    return openOrShowWindow(slidesSettingsWindowIdentifier, () => slidesWindows.open("SlidesSettingsWindow"));
}
export function openSlidesPresenterWindow() {
    return openOrShowWindow(windows.SlidesPresenterWindow.id, () => slidesWindows.open("SlidesPresenterWindow"));
}
