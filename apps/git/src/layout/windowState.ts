import type { SettingsIO } from "../settings/store";
import { isPlainObject } from "../settings/validate";

/** What the window remembers that is not a setting (spec §3.1): dragged divider positions and the collapsed sidebar. */
export type WindowState = { sidebarWidth?: number; sidebarCollapsed?: boolean };

export type WindowStateStore = {
  /** Resolves with the saved state (empty when there is none or it is unreadable). */
  ready: Promise<WindowState>;
  get(): WindowState;
  /** A SidebarSplitView resize: only `ready` metrics are kept, never the provisional ones of a drag in progress. */
  onResize(event: { phase: "provisional" | "ready"; sidebarWidth: number }): void;
  setSidebarCollapsed(collapsed: boolean): void;
  /** Forgets the remembered sizes (Reset Layout). */
  reset(): void;
  /** Writes a pending change now and stops. */
  close(): Promise<void>;
};

const safeName = (windowId: string) => windowId.replace(/[^A-Za-z0-9._-]/g, "_");

/** `<directory>/state/<window id>.json`, written `debounceMs` after the last change. */
export function createWindowStateStore({ io, directory, windowId, debounceMs = 300 }: { io: Pick<SettingsIO, "read" | "write" | "mkdir">; directory: string; windowId: string; debounceMs?: number }): WindowStateStore {
  const path = `${directory}/state/${safeName(windowId)}.json`;
  let state: WindowState = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let writing: Promise<void> = Promise.resolve();
  const ready = (async () => {
    try {
      const text = await io.read(path);
      const parsed = text === undefined ? undefined : JSON.parse(text) as unknown;
      if (isPlainObject(parsed)) {
        if (typeof parsed.sidebarWidth === "number" && Number.isFinite(parsed.sidebarWidth)) state.sidebarWidth = parsed.sidebarWidth;
        if (typeof parsed.sidebarCollapsed === "boolean") state.sidebarCollapsed = parsed.sidebarCollapsed;
      }
    } catch (error) { console.error(error); }
    return { ...state };
  })();
  const flush = () => {
    timer = null;
    const text = `${JSON.stringify(state, null, 2)}\n`;
    writing = writing.then(async () => { await io.mkdir(`${directory}/state`); await io.write(path, text); }).catch(console.error);
    return writing;
  };
  const change = (next: WindowState) => {
    if (closed || (next.sidebarWidth === state.sidebarWidth && next.sidebarCollapsed === state.sidebarCollapsed)) return;
    state = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };
  return {
    ready,
    get: () => ({ ...state }),
    onResize(event) {
      // A collapsed sidebar reports width 0; the width to restore is the one before it collapsed.
      if (event.phase !== "ready" || event.sidebarWidth <= 0) return;
      change({ ...state, sidebarWidth: Math.round(event.sidebarWidth) });
    },
    setSidebarCollapsed: collapsed => change({ ...state, sidebarCollapsed: collapsed }),
    reset: () => change({}),
    async close() {
      if (timer) { clearTimeout(timer); await flush(); }
      closed = true;
      await writing;
    },
  };
}
