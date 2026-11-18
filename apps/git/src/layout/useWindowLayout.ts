import { useEffect, useState } from "react";
import { observable, type Observable } from "@legendapp/state";
import { presetSettings } from "../settings/presets";
import { defaultPreset, type GitSettings, type PresetId } from "../settings/schema";
import { openGitSettings, sparkSettingsIO, type GitSettingsStore } from "../settings/store";
import { createDiffDocumentCache } from "./diffDocuments";
import { createWindowStateStore, type WindowState, type WindowStateStore } from "./windowState";

export type WindowLayout = {
  settings: GitSettings;
  /** The same settings as an observable, for narrow subscriptions (`settings$.panels.diff`); the store's once it is open. */
  settings$: Observable<GitSettings>;
  base: PresetId;
  /** null until the window's settings are open (and when they could not be opened). */
  store: GitSettingsStore | null;
  windowState: WindowStateStore | null;
  /** The saved window state; undefined until it is read, so the split view starts at the remembered sizes. */
  initialState: WindowState | undefined;
  documents: ReturnType<typeof createDiffDocumentCache>;
  /** What a panel instance keeps across remounts (its scroll offset), by instance id. */
  memory(id: string): { key?: string; scrollOffset: number };
};

const dataDirectory = async () => (require("@legendapp/spark/files") as typeof import("@legendapp/spark/files")).getDirectory("data");

/**
 * A window's settings store (one per window and repository: the repository layer follows `root`) and its window
 * state. Settings files that fail to open leave the built-in SourceTree layout.
 */
export function useWindowLayout(windowId: string, root: string | null): WindowLayout {
  const [settings, setSettings] = useState<{ settings: GitSettings; base: PresetId }>(() => ({ settings: presetSettings(defaultPreset), base: defaultPreset }));
  const [store, setStore] = useState<GitSettingsStore | null>(null);
  const [windowState, setWindowState] = useState<{ store: WindowStateStore | null; initial: WindowState | undefined }>({ store: null, initial: undefined });
  const [documents] = useState(createDiffDocumentCache);
  const [initial$] = useState(() => observable(presetSettings(defaultPreset)));
  const [memory] = useState(() => {
    const byId = new Map<string, { key?: string; scrollOffset: number }>();
    return (id: string) => { let entry = byId.get(id); if (!entry) byId.set(id, entry = { scrollOffset: 0 }); return entry; };
  });

  useEffect(() => {
    let disposed = false, opened: WindowStateStore | null = null;
    dataDirectory().then(directory => {
      if (disposed) return;
      opened = createWindowStateStore({ io: sparkSettingsIO(), directory, windowId });
      const current = opened;
      return current.ready.then(initial => { if (!disposed) setWindowState({ store: current, initial }); });
    }).catch((error: unknown) => {
      console.error(error);
      if (!disposed) setWindowState({ store: null, initial: {} });
    });
    return () => { disposed = true; void opened?.close(); };
  }, [windowId]);

  useEffect(() => {
    let disposed = false, opened: GitSettingsStore | null = null, unsubscribe: (() => void) | null = null;
    openGitSettings(root).then(async next => {
      opened = next;
      if (disposed) { void next.close(); return; }
      await next.ready;
      if (disposed) return;
      const publish = () => setSettings({ settings: next.settings$.peek(), base: next.base$.peek() });
      const offSettings = next.settings$.onChange(publish), offBase = next.base$.onChange(publish);
      unsubscribe = () => { offSettings(); offBase(); };
      publish();
      setStore(next);
    }).catch(console.error);
    return () => {
      disposed = true;
      unsubscribe?.();
      setStore(current => current === opened ? null : current);
      void opened?.close();
    };
  }, [root]);

  return { ...settings, settings$: store?.settings$ ?? initial$, store, windowState: windowState.store, initialState: windowState.initial, documents, memory };
}
