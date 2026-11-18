import { useMemo } from "react";
import type { HotkeyRouter } from "@legendapp/spark/shortcuts/commands";
import { commandMeta } from "./commandMeta";
import type { CommandId } from "./commands";

/** Required lazily: windows without routed bindings never load the keyboard module. */
const spark = () => require("@legendapp/spark/shortcuts/commands") as typeof import("@legendapp/spark/shortcuts/commands");
let router: HotkeyRouter | null = null;

/**
 * The window's key bindings menus can't carry (`routedBindings`): a command's extra bindings and commands the menu bar
 * doesn't list. Each runs the command in this window, the same way its menu item would.
 */
export function KeyBindingRouter({ windowId, bindings, run }: { windowId: string; bindings: Partial<Record<CommandId, readonly string[]>>; run: (id: CommandId) => boolean }) {
  const key = JSON.stringify(bindings);
  const { definitions, handlers } = useMemo(() => {
    const ids = Object.keys(bindings) as CommandId[];
    return {
      definitions: ids.map(id => ({ id, title: commandMeta[id].title, defaultBindings: bindings[id]! })),
      handlers: Object.fromEntries(ids.map(id => [id, () => run(id)])),
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `run` reads the window's current context
  spark().useRoutedHotkeys({ router: router ??= spark().createHotkeyRouter(), definitions, handlers, scope: { kind: "window", windowId } });
  return null;
}
