import type { SettingsIO } from "../settings/store";
import { isPlainObject } from "../settings/validate";

/** What the window remembers that is not a setting (spec §3.1): the open repository and sidebar state. */
export type WindowState = { repository?: string; sidebarWidth?: number; sidebarCollapsed?: boolean; sections?: Record<string, boolean> };

export type WindowStateStore = {
  /** Resolves with the saved state (empty when there is none or it is unreadable). */
  ready: Promise<WindowState>;
  get(): WindowState;
  setRepository(path: string | undefined): void;
  setSidebarCollapsed(collapsed: boolean): void;
  /** Remembers a sidebar section expanded or collapsed by the user. */
  setSectionExpanded(id: string, expanded: boolean): void;
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
        if (typeof parsed.repository === "string" && parsed.repository) state.repository = parsed.repository;
        if (typeof parsed.sidebarWidth === "number" && Number.isFinite(parsed.sidebarWidth)) state.sidebarWidth = parsed.sidebarWidth;
        if (typeof parsed.sidebarCollapsed === "boolean") state.sidebarCollapsed = parsed.sidebarCollapsed;
        if (isPlainObject(parsed.sections)) state.sections = Object.fromEntries(Object.entries(parsed.sections).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
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
    if (closed || (next.repository === state.repository && next.sidebarWidth === state.sidebarWidth && next.sidebarCollapsed === state.sidebarCollapsed && next.sections === state.sections)) return;
    state = next;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  };
  return {
    ready,
    get: () => ({ ...state }),
    setRepository: repository => change({ ...state, repository }),
    setSidebarCollapsed: collapsed => change({ ...state, sidebarCollapsed: collapsed }),
    setSectionExpanded: (id, expanded) => { if (state.sections?.[id] !== expanded) change({ ...state, sections: { ...state.sections, [id]: expanded } }); },
    reset: () => change({ repository: state.repository }),
    async close() {
      if (timer) { clearTimeout(timer); await flush(); }
      closed = true;
      await writing;
    },
  };
}
