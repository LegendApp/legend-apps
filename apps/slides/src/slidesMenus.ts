import { useMenu } from "@legendapp/spark/menus";
import { getSlidesState, setSlidesState } from "./slidesStore";
export function useSlidesMenus(openDeck: () => unknown, audienceOpen: boolean, blackout: boolean, resetPresenterLayout: () => void, openSettings: () => unknown) {
 useMenu({ id: "slides-presenter", items: [
      { type: "submenu",
        id: "app",
        label: "Legend Slides",
        target: { menu: "app" },
        items: [{ type: "action", id: "settings", target: { role: "settings" }, label: "Settings…", }],
      },
      { type: "submenu",
        id: "file",
        label: "File",
        target: { menu: "file" },
        placement: { before: { menu: "edit" } },
        items: [{ type: "action", id: "open", target: { role: "open" }, label: "Open…", }],
      },
      { type: "submenu",
        id: "presentation",
        label: "Presentation",
        placement: { before: { menu: "window" } },
        // The checkmark carries the state, so the label stays constant instead of
        // reading as a different command once a blackout is active.
        items: [{ type: "checkbox", checked: blackout,
          id: "blackout",
          label: "Blackout Audience",
          disabled: !audienceOpen,
        }, { type: "action",
          id: "reset-presenter-layout",
          label: "Reset Presenter Layout",
          }],
      },
    ], onAction(action) {
  if (action.type !== "action") return;
  if (action.itemId === "open") void openDeck();
  if (action.itemId === "blackout" && getSlidesState().audienceOpen) setSlidesState(current => ({ blackout: !current.blackout }));
  if (action.itemId === "reset-presenter-layout") resetPresenterLayout();
  if (action.itemId === "settings") void openSettings();
 } });
}
