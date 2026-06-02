import { useEffect } from "react";
import { addNativeMenuActionListener, clearMenus, configureMenus, type NativeMenuAction } from "@legend-desktop/native-menu";
import { state$ } from "@/systems/State";

const MENU_OWNER_ID = "music";
const APP_MENU_ID = "app";
const SETTINGS_MENU_ITEM_ID = "settings";

function handleMenuAction(action: NativeMenuAction) {
    if (action.ownerId === MENU_OWNER_ID && action.menuId === APP_MENU_ID && action.itemId === SETTINGS_MENU_ITEM_ID) {
        state$.showSettings.set(true);
    }
}

export function AppMenuController() {
    useEffect(() => {
        const subscription = addNativeMenuActionListener(handleMenuAction);

        configureMenus(MENU_OWNER_ID, [
            {
                id: APP_MENU_ID,
                title: "Legend Music",
                systemMenu: "app",
                items: [
                    {
                        id: SETTINGS_MENU_ITEM_ID,
                        targetTitles: ["Settings…", "Settings...", "Preferences…", "Preferences..."],
                    },
                ],
            },
        ]);

        return () => {
            subscription.remove();
            clearMenus(MENU_OWNER_ID);
        };
    }, []);

    return null;
}
