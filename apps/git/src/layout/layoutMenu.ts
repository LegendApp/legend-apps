import type { MenuItem } from "@legendapp/spark/menus";
import { activeLayout, isPresetId, presetFiles, viewFor } from "../settings/presets";
import type { GitSettings, LayoutNode, PresetId, ViewKind } from "../settings/schema";
import type { GitSettingsStore } from "../settings/store";
import { activeLayoutName, activePaneSizes, layoutChoices, layoutSnapshot, movePane, viewKey, type MoveDirection } from "./plan";
import type { PaneSizeWriter } from "./paneSizes";
import type { WindowStateStore } from "./windowState";

type LayoutState = { settings: GitSettings; base: PresetId; store: GitSettingsStore | null; windowState: WindowStateStore | null; paneSizes?: Pick<PaneSizeWriter, "cancel" | "flush"> };

const directions: { id: MoveDirection; label: string }[] = [{ id: "left", label: "Left" }, { id: "right", label: "Right" }, { id: "up", label: "Up" }, { id: "down", label: "Down" }];
export const panelTitles: Record<string, string> = {
  commitList: "Commit List", commitDetails: "Commit Details", fileList: "Files", unstaged: "Unstaged", staged: "Staged", changes: "Changes",
  composer: "Commit Message", diff: "Diff", prDetails: "Pull Request", empty: "Empty Pane",
};
const layoutTitle = (name: string) => isPresetId(name) ? String(presetFiles[name].name ?? name) : name;

/** Move Pane's result for the focused pane, or null when it can't move that way. */
export function movedView(state: Pick<LayoutState, "settings" | "base">, kind: ViewKind, focused: string, direction: MoveDirection): LayoutNode | null {
  return movePane(viewFor(activeLayout(state.settings, state.base), kind), focused, direction);
}

/** View ▸ Layout: presets and saved layouts (the active one checked), Save Layout As…, Reset Layout, Move Pane. */
export function layoutMenu(state: LayoutState, kind: ViewKind, focused: string): MenuItem {
  const { presets, saved } = layoutChoices(state.settings);
  const active = activeLayoutName(state.settings, state.base);
  const editable = !!state.store && !state.store.isReadOnly("user");
  const choice = (name: string): MenuItem => ({ type: "checkbox", id: `layout:use:${name}`, label: layoutTitle(name), checked: name === active, disabled: !editable });
  const title = panelTitles[focused.replace(/:.*/, "")] ?? focused;
  return {
    type: "submenu", id: "layout", label: "Layout", items: [
      ...presets.map(choice),
      ...saved.length ? [{ type: "separator" } as const, ...saved.map(choice)] : [],
      { type: "separator" },
      { type: "action", id: "layout:save", label: "Save Layout As…", disabled: !editable },
      { type: "action", id: "layout:reset", label: "Reset Layout", disabled: !editable },
      { type: "separator" },
      { type: "submenu", id: "layout:move", label: `Move Pane (${title})`, items: directions.map(({ id, label }) => ({
        type: "action" as const, id: `layout:move:${id}`, label: `Move ${label}`, disabled: !editable || !movedView(state, kind, focused, id),
      })) },
    ],
  };
}

/** Runs a `layout:` menu item: every change is an edit of the user settings file (or, for sizes, of window state). */
export async function runLayoutAction(itemId: string, { windowId, layout, kind, focused, onReset }: { windowId: string; layout: LayoutState; kind: ViewKind; focused: string; onReset?: () => void }) {
  const { store, settings, base, windowState } = layout;
  if (!store) return;
  const active = activeLayoutName(settings, base);
  try {
    if (itemId.startsWith("layout:use:")) {
      await store.edit("user", ["layout", "active"], itemId.slice("layout:use:".length));
    } else if (itemId === "layout:save") {
      const { showPrompt } = require("@legendapp/spark/dialogs") as typeof import("@legendapp/spark/dialogs");
      const result = await showPrompt({ windowId, title: "Save Layout As", message: "The current arrangement and sidebar width are saved in your settings file.", placeholder: "Layout name", confirmLabel: "Save" });
      const name = result.canceled ? "" : result.value.trim();
      if (name) {
        await layout.paneSizes?.flush();
        const latest = store.settings$.peek();
        const latestBase = store.base$.peek();
        const state = windowState?.get();
        await saveLayoutAs(store, latest, latestBase, name, { ...state, sidebarWidth: activePaneSizes(latest, latestBase).sidebar?.[0] ?? state?.sidebarWidth });
      }
    } else if (itemId === "layout:reset") {
      windowState?.reset();
      layout.paneSizes?.cancel();
      await store.edit("user", ["layout", "sizes", active], undefined);
      // A preset's layout drops the user's edits to it; a saved layout stays saved and the window goes back to the base preset.
      if (isPresetId(active)) await store.edit("user", ["layout", "layouts", active], undefined);
      else await store.edit("user", ["layout", "active"], undefined);
      onReset?.();
    } else if (itemId.startsWith("layout:move:")) {
      const moved = movedView(layout, kind, focused, itemId.slice("layout:move:".length) as MoveDirection);
      if (!moved) return;
      const key = viewKey(settings, base, kind);
      // A layout the settings already list takes the one view; a preset only named by `active` is written whole.
      if (Object.hasOwn(settings.layout.layouts, active)) await store.edit("user", ["layout", "layouts", active, "views", key], moved);
      else {
        const current = activeLayout(settings, base);
        await store.edit("user", ["layout", "layouts", active], { ...current, views: { ...current.views, [key]: moved } });
      }
    }
  } catch (error) {
    const { showMessage } = require("@legendapp/spark/dialogs") as typeof import("@legendapp/spark/dialogs");
    await showMessage({ windowId, kind: "warning", title: "Couldn’t Change the Layout", message: error instanceof Error ? error.message : String(error) }).catch(console.error);
  }
}

/** Save Layout As…: the active layout with the window's current sizes, as `layouts.<name>` in the user file, made active. */
export async function saveLayoutAs(store: Pick<GitSettingsStore, "edit">, settings: GitSettings, base: PresetId, name: string, state: { sidebarWidth?: number; sidebarCollapsed?: boolean }) {
  await store.edit("user", ["layout", "layouts", name], layoutSnapshot(settings, base, state));
  // The new layout starts at the sizes the panes have now.
  const sizes = settings.layout.sizes?.[activeLayoutName(settings, base)];
  if (sizes && name !== activeLayoutName(settings, base)) await store.edit("user", ["layout", "sizes", name], sizes);
  await store.edit("user", ["layout", "active"], name);
}
