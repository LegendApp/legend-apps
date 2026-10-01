import { ownRegistration } from "@legend-apps/runtime-utils";
import { createHotkeyRouter, formatHotkey, useRoutedHotkeys, type HotkeyValue } from "@legendapp/spark/shortcuts/commands";
import { observable, observe } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useEffect, useMemo } from "react";
import { type HotkeyName, getHotkey, getHotkeyMetadata, hotkeys$ } from "../../settings/Hotkeys";
import { state$ } from "../State";

export interface HotkeyInfo {
  name: string;
  key: HotkeyValue;
  description: string;
  repeat?: boolean;
  keyText?: string;
}
export const hotkeyRegistry$ = observable<Record<string, HotkeyInfo>>({});
const photosHotkeyRouter = createHotkeyRouter();
type HotkeyCallbacks = Partial<Record<HotkeyName, () => boolean | void>>;
const scope = { kind: "window", windowId: "main" } as const;

function definitionsFor(names: string[]) {
  return names.map(name => {
    const key = getHotkey(name as HotkeyName);
    const metadata = getHotkeyMetadata(name as HotkeyName);
    return {
      id: name as HotkeyName,
      title: name,
      description: metadata?.description ?? name,
      defaultBindings: key ? [key] : [],
      repeat: metadata?.repeat,
    };
  });
}

function publishHelp(definitions: ReturnType<typeof definitionsFor>) {
  for (const definition of definitions) {
    const key = definition.defaultBindings[0] ?? "";
    hotkeyRegistry$[definition.id].set({
      name: definition.id,
      key,
      description: definition.description,
      repeat: definition.repeat,
      keyText: key ? formatHotkey(key) : "Unassigned",
    });
  }
}

/** Plugins own the same native registration contract as React consumers. */
export function onHotkeys(handlers: HotkeyCallbacks) {
  return observe(effect => {
    const definitions = definitionsFor(Object.keys(handlers));
    publishHelp(definitions);
    let enabled = !state$.showSettings.peek();
    let active = true;
    // Disposal takes effect before the asynchronous native removal finishes.
    const liveHandlers = Object.fromEntries(Object.entries(handlers).map(([name, action]) => [name, () => active ? action?.() : false]));
    const owner = ownRegistration(photosHotkeyRouter.register({ definitions, handlers: liveHandlers, scope, enabled }));
    const stopEnabled = observe(() => {
      const nextEnabled = !state$.showSettings.get();
      if (nextEnabled !== enabled) {
        enabled = nextEnabled;
        void owner.ready.then(handle => {
          if (active) return handle.setEnabled(enabled);
        }).catch(console.error);
      }
    });
    effect.onCleanup = () => {
      active = false;
      stopEnabled();
      void owner.remove().catch(console.error);
    };
  });
}

export function useOnHotkeys(handlers: HotkeyCallbacks, enabled = true) {
  const names = JSON.stringify(Object.keys(handlers));
  const bindings = useValue(hotkeys$);
  const showSettings = useValue(state$.showSettings);
  const definitions = useMemo(() => definitionsFor(JSON.parse(names)), [names, bindings]);
  useEffect(() => publishHelp(definitions), [definitions]);
  useRoutedHotkeys({
    router: photosHotkeyRouter,
    definitions,
    handlers,
    scope,
    enabled: enabled && !showSettings,
    onError: console.error,
  });
}
