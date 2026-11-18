import type { MenuItem } from "@legendapp/spark/menus";
import type { GitSettings } from "../settings/schema";
import type { GitSettingsStore } from "../settings/store";

/** View ▸ Diff (spec §6): Unified / Side by Side, and the side-by-side split; the active ones are checked. */
export function diffMenu(diff: GitSettings["panels"]["diff"], editable: boolean): MenuItem {
  const sideBySide = diff.mode === "sideBySide";
  return {
    type: "submenu", id: "diff", label: "Diff", items: [
      { type: "checkbox", id: "diff:mode:unified", label: "Unified", checked: !sideBySide, disabled: !editable },
      { type: "checkbox", id: "diff:mode:sideBySide", label: "Side by Side", checked: sideBySide, disabled: !editable },
      { type: "separator" },
      { type: "checkbox", id: "diff:split:vertical", label: "Split Vertically", checked: sideBySide && diff.sideBySideSplit === "vertical", disabled: !editable },
      { type: "checkbox", id: "diff:split:horizontal", label: "Split Horizontally", checked: sideBySide && diff.sideBySideSplit === "horizontal", disabled: !editable },
    ],
  };
}

/** Runs a `diff:` menu item: an edit of the user settings file. A split choice also turns side by side on. */
export async function runDiffAction(itemId: string, store: Pick<GitSettingsStore, "edit">) {
  const [, kind, value] = itemId.split(":");
  if (kind === "mode" && (value === "unified" || value === "sideBySide")) await store.edit("user", ["panels", "diff", "mode"], value);
  else if (kind === "split" && (value === "vertical" || value === "horizontal")) {
    await store.edit("user", ["panels", "diff", "mode"], "sideBySide");
    await store.edit("user", ["panels", "diff", "sideBySideSplit"], value);
  }
}
