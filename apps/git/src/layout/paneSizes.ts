import type { GitSettings, PresetId } from "../settings/schema";
import type { GitSettingsStore } from "../settings/store";
import { activeLayoutName } from "./plan";

/** A divider drag: `path` is a split's `sizeKey` (or `sidebar`), `sizes` its panes' sizes in points along the axis. */
export type PaneResize = (path: string, sizes: readonly number[]) => void;

export type PaneSizeWriter = {
  onPaneResize: PaneResize;
  /** Writes pending sizes now. */
  flush(): Promise<void>;
  /** Drops pending sizes (Reset Layout). */
  cancel(): void;
};

/**
 * The one place pane sizes are saved: each resize is written to the user settings file at
 * `layout.sizes.<active layout>.<path>`, `debounceMs` after the last resize of that path, rounded to points. A size equal
 * to the saved one writes nothing. Spark's SplitView (and SidebarSplitView's `ready` resizes) call `onPaneResize`.
 */
export function createPaneSizeWriter({ store, current, debounceMs = 300 }: {
  store: () => Pick<GitSettingsStore, "edit"> | null;
  current: () => { settings: GitSettings; base: PresetId };
  debounceMs?: number;
}): PaneSizeWriter {
  const pending = new Map<string, { layout: string; sizes: number[] }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const target = store();
    const entries = [...pending.entries()];
    pending.clear();
    if (!target) return;
    for (const [key, { layout, sizes }] of entries) {
      const path = key.slice(layout.length + 1);
      const saved = current().settings.layout.sizes?.[layout]?.[path];
      if (saved && saved.length === sizes.length && saved.every((size, index) => size === sizes[index])) continue;
      await target.edit("user", ["layout", "sizes", layout, path], sizes);
    }
  };
  return {
    onPaneResize(path, sizes) {
      if (!path || !sizes.length || !sizes.every(size => Number.isFinite(size) && size >= 0)) return;
      const { settings, base } = current();
      const layout = activeLayoutName(settings, base);
      pending.set(`${layout}/${path}`, { layout, sizes: sizes.map(size => Math.round(size)) });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush().catch(console.error), debounceMs);
    },
    flush,
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
