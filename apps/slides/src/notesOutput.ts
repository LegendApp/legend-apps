import { observable } from "@legendapp/state";
import { closeWindow, getDisplays, WindowStyleMask, type Display } from "@legendapp/spark/windows/managed";
import { slidesWindows } from "./slidesWindows";
import { displayKey } from "./displayRoles";
import { displayRolesSetting } from "./slidesSettings";

export const notesOutput$ = observable({ elapsed: 0, preview: false });
let outputKey: string | null = null;
let windowOpen = false;
let queue = Promise.resolve();
let replacing = false;
let shuttingDown = false;
export function resumeNotesOutput() { shuttingDown = false; }
async function closeNotesWindow() {
  if (!windowOpen) return;
  const result = await closeWindow("slides-notes");
  if (!result.success) throw new Error(result.message ?? "Could not close the notes window.");
  windowOpen = false;
  outputKey = null;
}
export function syncNotesOutput(displays: Display[], presenting: boolean) {
  if (shuttingDown) return queue;
  queue = queue.catch(() => {}).then(async () => {
    if (notesOutput$.preview.peek()) return;
    const key = displayRolesSetting.get().notes;
    const display = presenting ? displays.find(display => displayKey(display) === key || display.id === key) : undefined;
    if (!display) {
      await closeNotesWindow();
      outputKey = null;
      return;
    }
    const frameKey = JSON.stringify([displayKey(display), display.frame]);
    if (frameKey === outputKey) return;
    await slidesWindows.open("SlidesNotesWindow", { x: display.frame.x, y: display.frame.y,
      windowStyle: { width: display.frame.width, height: display.frame.height,
        mask: [WindowStyleMask.Titled, WindowStyleMask.Closable, WindowStyleMask.Resizable] } });
    windowOpen = true;
    outputKey = frameKey;
  });
  return queue;
}
/** Drain in-flight preview/output opens before closing the presenter. */
export function closeNotesOutput() {
  shuttingDown = true;
  queue = queue.catch(() => {}).then(async () => {
    const result = await closeWindow("slides-notes");
    if (!result.success && result.message !== "No window to close") throw new Error(result.message ?? "Could not close the notes window.");
    notesOutputClosed();
  }).catch(error => { shuttingDown = false; throw error; });
  return queue;
}
export function previewNotesOutput() {
  if (shuttingDown) return queue;
  queue = queue.catch(() => {}).then(async () => {
    replacing = true;
    try {
      await closeNotesWindow();
      const displays = await getDisplays();
      const screen = displays.find(display => display.isMain) ?? displays[0];
      const frame = screen?.visibleFrame;
      const width = Math.min(1000, frame?.width ?? 1000);
      const height = Math.min(900, frame?.height ?? 900);
      outputKey = null;
      await slidesWindows.open("SlidesNotesWindow", {
        ...(frame ? { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2 } : {}),
        windowStyle: { width, height, mask: [WindowStyleMask.Titled, WindowStyleMask.Closable, WindowStyleMask.Resizable] },
      });
      windowOpen = true;
      notesOutput$.preview.set(true);
    } finally { replacing = false; }
  });
  return queue;
}
export function notesOutputClosed() { windowOpen = false; if (!replacing) { notesOutput$.preview.set(false); outputKey = null; } }
export async function identifyDisplays(displays: Display[]) {
  await Promise.all(displays.map(async (display, index) => {
    const identifier = `slides-identify-${display.id}`;
    await slidesWindows.open("SlidesIdentifyWindow", { identifier,
      x: display.frame.x + (display.frame.width - 300) / 2, y: display.frame.y + (display.frame.height - 220) / 2,
      initialProperties: { number: index + 1, name: display.name } });
    setTimeout(() => void closeWindow(identifier), 4000);
  }));
}
