import { observable } from "@legendapp/state";
import { closeWindow, getDisplays, WindowStyleMask, type Display } from "@legend-apps/window-manager";
import { slidesWindows } from "./slidesWindows";
import { displayKey } from "./displayRoles";
import { displayRolesSetting } from "./slidesSettings";

export const notesOutput$ = observable({ elapsed: 0, preview: false });
let outputKey: string | null = null;
let queue = Promise.resolve();
let replacing = false;
export function syncNotesOutput(displays: Display[], presenting: boolean) {
  queue = queue.catch(() => {}).then(async () => {
    if (notesOutput$.preview.peek()) return;
    const key = displayRolesSetting.get().notes;
    const display = presenting ? displays.find(display => displayKey(display) === key || display.id === key) : undefined;
    if (!display) {
      if (outputKey) await closeWindow("slides-notes");
      outputKey = null;
      return;
    }
    const frameKey = JSON.stringify([displayKey(display), display.frame]);
    if (frameKey === outputKey) return;
    await slidesWindows.open("SlidesNotesWindow", { x: display.frame.x, y: display.frame.y,
      windowStyle: { width: display.frame.width, height: display.frame.height,
        mask: [WindowStyleMask.Titled, WindowStyleMask.Closable, WindowStyleMask.Resizable] } });
    outputKey = frameKey;
  });
  return queue;
}
export function previewNotesOutput() {
  queue = queue.catch(() => {}).then(async () => {
    replacing = true;
    try {
      await closeWindow("slides-notes");
      const displays = await getDisplays();
      const screen = displays.find(display => display.isMain) ?? displays[0];
      const frame = screen?.visibleFrame;
      const width = Math.min(1000, frame?.width ?? 1000);
      const height = Math.min(900, frame?.height ?? 900);
      notesOutput$.preview.set(true);
      outputKey = null;
      await slidesWindows.open("SlidesNotesWindow", {
        ...(frame ? { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2 } : {}),
        windowStyle: { width, height, mask: [WindowStyleMask.Titled, WindowStyleMask.Closable, WindowStyleMask.Resizable] },
      });
    } finally { replacing = false; }
  });
  return queue;
}
export function notesOutputClosed() { if (!replacing) { notesOutput$.preview.set(false); outputKey = null; } }
export async function identifyDisplays(displays: Display[]) {
  await Promise.all(displays.map(async (display, index) => {
    const identifier = `slides-identify-${display.id}`;
    await slidesWindows.open("SlidesIdentifyWindow", { identifier,
      x: display.frame.x + (display.frame.width - 300) / 2, y: display.frame.y + (display.frame.height - 220) / 2,
      initialProperties: { number: index + 1, name: display.name } });
    setTimeout(() => void closeWindow(identifier), 4000);
  }));
}
