import { ownRegistration } from "@legend-apps/runtime-utils";
import { beforeQuit } from "@legendapp/spark/app";

/** A save can succeed while a newer edit remains unsaved. Never exit in that case. */
export async function prepareDraftExit(
  session: { getSnapshot(): { dirty: boolean }; save(): Promise<boolean> },
  choose: () => Promise<"cancel" | "discard" | "save">,
) {
  if (!session.getSnapshot().dirty) return true;
  const choice = await choose();
  return choice === "discard" || choice === "save" && await session.save() && !session.getSnapshot().dirty;
}

const preparations = new Set<() => Promise<boolean>>();
let pending: Promise<boolean> | undefined;
export function registerSlidesExitPreparation(handler: () => Promise<boolean>) {
  preparations.add(handler);
  return () => { preparations.delete(handler); };
}
export function prepareSlidesExit() {
  if (!pending) {
    pending = Promise.resolve().then(async () => {
      for (const prepare of preparations) if (!await prepare()) return false;
      return true;
    }).catch(() => false)
      .finally(() => { pending = undefined; });
  }
  return pending;
}
export function installSlidesExitHandler() {
  return ownRegistration(beforeQuit(prepareSlidesExit));
}
