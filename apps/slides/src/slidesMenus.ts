import {
  addNativeMenuActionListener,
  clearMenus,
  commandModifier,
  configureMenus,
  openTargetTitles,
  settingsTargetTitles,
  updateMenuItems,
} from "@legend-apps/native-menu";
import { useEffect } from "react";
import { getSlidesState, setSlidesState } from "./slidesStore";

const menuOwner = "slides-presenter";

export function useSlidesMenus(
  openDeck: () => void | Promise<void>,
  audienceOpen: boolean,
  blackout: boolean,
  resetPresenterLayout: () => void,
  openSettings: () => void | Promise<void>,
) {
  useEffect(() => {
    configureMenus(menuOwner, [
      {
        id: "app",
        title: "Application",
        systemMenu: "app",
        items: [{ id: "settings", targetTitles: settingsTargetTitles, enabled: true }],
      },
      {
        id: "file",
        title: "File",
        placement: { before: "Window" },
        items: [{ id: "open", targetTitles: openTargetTitles, enabled: true }],
      },
      {
        id: "presentation",
        title: "Presentation",
        placement: { before: "Window" },
        items: [{
          id: "blackout",
          title: "Blackout Audience",
          enabled: false,
          shortcut: { key: "b", modifiers: commandModifier },
        }, {
          id: "reset-presenter-layout",
          title: "Reset Presenter Layout",
          enabled: true,
        }],
      },
    ]);
    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== menuOwner) return;
      if (action.itemId === "open") void openDeck();
      if (action.itemId === "blackout" && getSlidesState().audienceOpen) {
        setSlidesState((current) => ({ blackout: !current.blackout }));
      }
      if (action.itemId === "reset-presenter-layout") resetPresenterLayout();
      if (action.itemId === "settings") void openSettings();
    });
    return () => {
      subscription.remove();
      clearMenus(menuOwner);
    };
  }, [openDeck, openSettings, resetPresenterLayout]);

  useEffect(() => {
    updateMenuItems(menuOwner, [{
      id: "blackout",
      checked: blackout,
      enabled: audienceOpen,
      title: blackout ? "Restore Audience" : "Blackout Audience",
    }]);
  }, [audienceOpen, blackout]);
}
