import { addAppExitListener, completeAppExit } from "@legend-apps/app-exit";

/** A save can succeed while a newer edit remains unsaved. Never exit in that case. */
export async function prepareDraftExit(
  session: { getSnapshot(): { dirty: boolean }; save(): Promise<boolean> },
  choose: () => Promise<"cancel" | "discard" | "save">,
) {
  if (!session.getSnapshot().dirty) return true;
  const choice = await choose();
  return choice === "discard" || choice === "save" && await session.save() && !session.getSnapshot().dirty;
}

let prepare: (() => Promise<boolean>) | undefined;
let pending: Promise<boolean> | undefined;
export function registerSlidesExitPreparation(handler: () => Promise<boolean>) {
  prepare = handler;
  return () => { if (prepare === handler) prepare = undefined; };
}
export function prepareSlidesExit() {
  if (!pending) {
    pending = Promise.resolve().then(() => prepare?.() ?? true).catch(() => false)
      .finally(() => { pending = undefined; });
  }
  return pending;
}
export function installSlidesExitHandler() {
  let exiting = false;
  return addAppExitListener(event => {
    if (event.reason === "requested" && !exiting) {
      exiting = true;
      void prepareSlidesExit().then(completeAppExit).finally(() => { exiting = false; });
    }
  });
}
