import {
  addNativeMenuActionListener,
  clearMenus,
  commandModifier,
  configureMenus,
  openTargetTitles,
  updateMenuItems,
} from "@legend-apps/native-menu";
import { useEffect } from "react";
import { getSlidesState, setSlidesState } from "./slidesStore";

const menuOwner = "slides-presenter";

export function useSlidesMenus(openDeck: () => void | Promise<void>, audienceOpen: boolean, blackout: boolean) {
  useEffect(() => {
    configureMenus(menuOwner, [
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
        }],
      },
    ]);
    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== menuOwner) return;
      if (action.itemId === "open") void openDeck();
      if (action.itemId === "blackout" && getSlidesState().audienceOpen) {
        setSlidesState((current) => ({ blackout: !current.blackout }));
      }
    });
    return () => {
      subscription.remove();
      clearMenus(menuOwner);
    };
  }, [openDeck]);

  useEffect(() => {
    updateMenuItems(menuOwner, [{
      id: "blackout",
      checked: blackout,
      enabled: audienceOpen,
      title: blackout ? "Restore Audience" : "Blackout Audience",
    }]);
  }, [audienceOpen, blackout]);
}
