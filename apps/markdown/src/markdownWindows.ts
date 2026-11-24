import { createSettingsWindowOptions } from "@legendapp/spark/ui/settings";
import { createWindowsNavigator, type WindowsConfig } from "@legendapp/spark/windows";
import { closeWindow, setWindowOptions, } from "@legendapp/spark/windows";
import { getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import type { MarkdownSaveState } from "@legend-apps/markdown-document";
import { editorWindowIdentifier, editorWindowModuleName, settingsWindowIdentifier, settingsWindowModuleName, } from "./appConstants";
import { getMarkdownChromeTheme, getMarkdownDisplayThemeSetting } from "./markdownSettings";
import { markdownEditorWindowTitle } from "./markdownWindowTitle";
import { SettingsWindow } from "./SettingsWindow";
import { loadMarkdownUserThemesSync } from "./userThemes";
import { openOrShowWindow } from "@legend-apps/runtime-utils";
import { openDocumentWindow, type WorkspaceWindowProps } from "@legend-apps/workspace";
loadMarkdownUserThemesSync();
function createMarkdownEditorWindowStyle({ appearance, includeFrame, }: {
    appearance?: "dark" | "light";
    includeFrame: boolean;
}) {
    return {
        appearance: appearance ?? getLegendDisplayThemeAppearance(getMarkdownDisplayThemeSetting()),
        // Clear, so the editor's Liquid Glass chrome shows what is behind the window.
        backgroundColor: "#00000000",

        macos: {
            toolbar: {
                visible: true,
                // The toolbar style sets the native title bar height, which centers the traffic lights.
                style: getMarkdownChromeTheme().titleBarHeight < 44 ? "unifiedCompact" as const : "unified" as const,
            },
            titleBar: {
                contentLayout: "fullSize" as const,
                transparent: true,
                titleVisibility: "hidden" as const
            }
        }
    };
}
function createMarkdownEditorWindowOptions() {
    const editorWindowStyle = createMarkdownEditorWindowStyle({ includeFrame: true });
    return {
        title: "Untitled",
        ...editorWindowStyle,
        macos: { ...editorWindowStyle.macos, restoreOnLaunch: true }
    };
}
function createMarkdownWindowsNavigator() {
    // Register synchronously after this module has loaded, so editor hooks can
    // import its window operations without an initialization cycle.
    const { MarkdownEditorWindow } = require("./MarkdownEditorWindow") as typeof import("./MarkdownEditorWindow");
    const markdownWindowsConfig = {
        [editorWindowModuleName]: {
            component: MarkdownEditorWindow,
            id: editorWindowIdentifier,
            options: createMarkdownEditorWindowOptions(),
        },
        [settingsWindowModuleName]: {
            component: SettingsWindow,
            id: settingsWindowIdentifier,
            options: createSettingsWindowOptions(),
        },
    } satisfies WindowsConfig;
    return createWindowsNavigator(markdownWindowsConfig);
}
let MarkdownWindowsNavigator: ReturnType<typeof createMarkdownWindowsNavigator>;
export function registerMarkdownWindows() {
    MarkdownWindowsNavigator ??= createMarkdownWindowsNavigator();
}
export function openMarkdownSettingsWindow() {
    return openOrShowWindow(settingsWindowIdentifier, () => MarkdownWindowsNavigator.open(settingsWindowModuleName));
}
export type MarkdownEditorWindowProps = WorkspaceWindowProps & { launchArguments?: string[] };
/** Opens a new editor window; the first takes the restorable base ID and later ones are numbered. */
export function openMarkdownEditorWindow(props: MarkdownEditorWindowProps = {}) {
    return openDocumentWindow(editorWindowIdentifier, props, createMarkdownEditorWindowOptions());
}
export function closeMarkdownEditorWindow() {
    return closeWindow(editorWindowIdentifier);
}
export function showMarkdownEditorWindow() {
    return MarkdownWindowsNavigator.show(editorWindowModuleName);
}
export function setMarkdownEditorWindowOptions({ appearance, filename, isDirty, isUntitledDocument, saveState, windowId, }: {
    appearance: "dark" | "light";
    filename: string;
    isDirty: boolean;
    isUntitledDocument: boolean;
    saveState: MarkdownSaveState;
    windowId: string;
}) {
    return setWindowOptions(windowId, {
        title: markdownEditorWindowTitle({ filename, isDirty, isUntitledDocument, saveState }),
        ...createMarkdownEditorWindowStyle({ appearance, includeFrame: false })
    });
}
