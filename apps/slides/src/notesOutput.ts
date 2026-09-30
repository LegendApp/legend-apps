import { observable } from "@legendapp/state";
import { closeWindow, getDisplays, openWindow, type DisplayInfo } from "@legendapp/spark/windows";
import { setWindowBounds } from "@legendapp/spark/windows/macos";
import { AppRegistry } from "react-native";
import { createElement } from "react";
import { WindowProvider } from "@legendapp/spark/windows";
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
    if (!windowOpen)
        return;
    const result = await closeWindow("slides-notes");
    if (!result.closed) throw new Error("Closing the notes window was vetoed.");
    windowOpen = false;
    outputKey = null;
}
export function syncNotesOutput(displays: DisplayInfo[], presenting: boolean) {
    if (shuttingDown)
        return queue;
    queue = queue.catch(() => { }).then(async () => {
        if (notesOutput$.preview.peek())
            return;
        const key = displayRolesSetting.get().notes;
        const display = presenting ? displays.find(display => displayKey(display) === key || display.id === key) : undefined;
        if (!display) {
            await closeNotesWindow();
            outputKey = null;
            return;
        }
        const frameKey = JSON.stringify([displayKey(display), display.size]);
        if (frameKey === outputKey)
            return;
        const bounds = { displayId: display.id, x: 0, y: 0, ...display.size };
        if (windowOpen) await setWindowBounds("slides-notes", bounds);
        else await slidesWindows.open("SlidesNotesWindow", { options: { position: { displayId: display.id, x: 0, y: 0 }, size: display.size } });
        windowOpen = true;
        outputKey = frameKey;
    });
    return queue;
}
/** Drain in-flight preview/output opens before closing the presenter. */
export function closeNotesOutput() {
    shuttingDown = true;
    queue = queue.catch(() => { }).then(async () => {
        const result = await closeWindow("slides-notes");
        if (!result.closed) throw new Error("Closing the notes window was vetoed.");
        notesOutputClosed();
    }).catch(error => { shuttingDown = false; throw error; });
    return queue;
}
export function previewNotesOutput() {
    if (shuttingDown)
        return queue;
    queue = queue.catch(() => { }).then(async () => {
        replacing = true;
        try {
            await closeNotesWindow();
            const displays = await getDisplays();
            const screen = displays.find(display => display.primary) ?? displays[0];
            const frame = screen?.workArea;
            const width = Math.min(1000, frame?.width ?? 1000);
            const height = Math.min(900, frame?.height ?? 900);
            outputKey = null;
            await slidesWindows.open("SlidesNotesWindow", {
                options: {
                    ...(frame && screen ? { position: { displayId: screen.id, x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2 } } : {}), size: { width, height }
                }
            });
            windowOpen = true;
            notesOutput$.preview.set(true);
        }
        finally {
            replacing = false;
        }
    });
    return queue;
}
export function notesOutputClosed() { windowOpen = false; if (!replacing) {
    notesOutput$.preview.set(false);
    outputKey = null;
} }
export async function identifyDisplays(displays: DisplayInfo[]) {
    await Promise.all(displays.map(async (display, index) => {
        const identifier = `slides-identify-${display.id}`;
        const { IdentifyWindow } = await import("./NotesWindow");
        if (!AppRegistry.getAppKeys().includes(identifier)) AppRegistry.registerComponent(identifier, () => props => createElement(WindowProvider, { id: identifier, children: createElement(IdentifyWindow, { number: props.number, name: props.name }) }));
        await openWindow({ id: identifier, component: identifier, props: { number: index + 1, name: display.name }, title: "Identify Display", appearance: "dark", size: { width: 300, height: 220 }, position: { displayId: display.id, x: (display.size.width - 300) / 2, y: (display.size.height - 220) / 2 } });
        setTimeout(() => { void closeWindow(identifier).catch(console.error); }, 4000);
    }));
}
