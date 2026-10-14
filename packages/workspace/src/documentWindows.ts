import { addWindowListener, openWindow, type AsyncRegistration, type NavigatorWindowOptions, type WindowOpenOptions } from "@legendapp/spark/windows";
import { useEffect } from "react";
import type { WorkspaceWindowProps } from "./workspaceState";

const liveWindowIds = new Set<string>();
const focusOrder: string[] = [];

function noteFocus(windowId: string) {
  const index = focusOrder.indexOf(windowId);
  if (index >= 0) focusOrder.splice(index, 1);
  focusOrder.push(windowId);
}

/**
 * Opens another window on the component Spark's navigator registered for `baseId`. The first window takes
 * the base ID while it is free, so it keeps its restored state; later ones are numbered.
 */
export async function openDocumentWindow(
  baseId: string,
  props: WorkspaceWindowProps & Record<string, unknown>,
  options: NavigatorWindowOptions,
) {
  let windowId = baseId;
  for (let count = 2; liveWindowIds.has(windowId); count++) windowId = `${baseId}-${count}`;
  liveWindowIds.add(windowId);
  try {
    // Optional props must be absent rather than undefined at the native JSON boundary.
    const windowProps = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined));
    return await openWindow({ ...options, component: `spark.window.${baseId}`, id: windowId, props: { ...windowProps, windowId } } as WindowOpenOptions);
  } catch (error) {
    liveWindowIds.delete(windowId);
    throw error;
  }
}

/** Marks a mounted window live and tracks its focus until the returned cleanup runs. */
export function trackDocumentWindow(windowId: string) {
  liveWindowIds.add(windowId);
  noteFocus(windowId);
  let disposed = false;
  let registration: AsyncRegistration | undefined;
  void addWindowListener(windowId, "focusChanged", event => { if (!disposed && event.focused) noteFocus(windowId); }).then(value => {
    if (disposed) void value.remove().catch(console.error);
    else registration = value;
  }).catch(console.error);
  return () => {
    disposed = true;
    liveWindowIds.delete(windowId);
    const index = focusOrder.indexOf(windowId);
    if (index >= 0) focusOrder.splice(index, 1);
    void registration?.remove().catch(console.error);
  };
}

export function useDocumentWindow(windowId: string) {
  useEffect(() => trackDocumentWindow(windowId), [windowId]);
}

/** Per-window targets for app-level menus and open requests, resolved by focus order, then registration order. */
export function createDocumentWindowRegistry<T>() {
  const targets = new Map<string, T>();
  return {
    active(): T | undefined {
      for (let index = focusOrder.length - 1; index >= 0; index--) {
        const target = targets.get(focusOrder[index]);
        if (target) return target;
      }
      return [...targets.values()].pop();
    },
    register(windowId: string, target: T) {
      targets.delete(windowId);
      targets.set(windowId, target);
      return () => { if (targets.get(windowId) === target) targets.delete(windowId); };
    },
  };
}
