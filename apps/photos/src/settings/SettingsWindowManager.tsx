import { addAppListener } from "@legendapp/spark/app";
import { getWindow, getDisplays } from "@legendapp/spark/windows";
import { createWindowsNavigator } from "@legendapp/spark/windows";
import { useEffect } from "react";
import { state$ } from "../systems/State";
const windows = createWindowsNavigator({ PhotosSettings: {
        id: "photos-settings",
        loadComponent: () => import("./SettingsContainer").then(module => ({ default: module.SettingsContainer })),
        options: {
            title: "Photos Settings",
            ...{
                macos: {
                    titleBar: {
                        contentLayout: "fullSize",
                        transparent: true
                    }
                }
            }
        },
    } });
export function SettingsWindowManager() {
    useEffect(() => {
        const dispose = state$.showSettings.onChange(({ value }) => {
            void (value ? windows.open("PhotosSettings") : windows.close("PhotosSettings")).catch(error => { console.error(error); state$.showSettings.set(false); });
        });
        const subscription = addAppListener("windowClosed", ({ windowId: identifier }) => {
            if (identifier === "photos-settings")
                state$.showSettings.set(false);
        });
        return () => { dispose(); subscription.remove(); };
    }, []);
    return null;
}
