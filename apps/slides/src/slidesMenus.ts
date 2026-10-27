import { useMenu } from "@legendapp/spark/menus";
import { useValue } from "@legendapp/state/react";
import { getSlidesState, setSlidesState, slidesState$ } from "./slidesStore";
import { exportDeckToHTML, webExport$ } from "./webExport";
export function useSlidesMenus(openDeck: () => unknown, audienceOpen: boolean, blackout: boolean, resetPresenterLayout: () => void, openSettings: () => unknown) {
 const canExport = useValue(() => !!slidesState$.deckPath.get() && !["choosing", "exporting"].includes(webExport$.status.get()));
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
        items: [{ type: "action", id: "open", target: { role: "open" }, label: "Open…", },
          { type: "action", id: "export-html", label: "Export to HTML…", disabled: !canExport }],
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
  if (action.itemId === "export-html") void exportDeckToHTML();
  if (action.itemId === "blackout" && getSlidesState().audienceOpen) setSlidesState(current => ({ blackout: !current.blackout }));
  if (action.itemId === "reset-presenter-layout") resetPresenterLayout();
  if (action.itemId === "settings") void openSettings();
 } });
}
