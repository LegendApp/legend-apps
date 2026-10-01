import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, type WindowsConfig } from "@legendapp/spark/windows";
import { closeWindow, setWindowOptions, } from "@legendapp/spark/windows";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import type { MarkdownSaveState } from "@legend-apps/markdown-document";
import { editorWindowIdentifier, editorWindowModuleName, settingsWindowIdentifier, settingsWindowModuleName, } from "./appConstants";
import { getMarkdownDisplayThemeSetting } from "./markdownSettings";
import { markdownEditorWindowTitle } from "./markdownWindowTitle";
import { SettingsWindow } from "./SettingsWindow";
import { loadMarkdownUserThemesSync } from "./userThemes";
import { openOrShowWindow } from "@legend-apps/runtime-utils";
loadMarkdownUserThemesSync();
function createMarkdownEditorWindowStyle({ appearance, backgroundColor, includeFrame, }: {
    appearance?: "dark" | "light";
    backgroundColor?: string;
    includeFrame: boolean;
}) {
    const displayThemeSetting = getMarkdownDisplayThemeSetting();
    const displayTheme = getLegendDisplayTheme(displayThemeSetting);
    return {
        appearance: appearance ?? getLegendDisplayThemeAppearance(displayThemeSetting),
        backgroundColor: backgroundColor ?? displayTheme.colors.windowBackground,

        macos: {
            titleBar: {
                contentLayout: "fullSize" as const,
                transparent: true
            }
        }
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
            options: {
                title: "Untitled",
                ...createMarkdownEditorWindowStyle({ includeFrame: true }),
                macos: {
                    restoreOnLaunch: true, titleBar: { contentLayout: "fullSize", transparent: true }
                }
            },
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
export function openMarkdownEditorWindow(launchArguments?: string[]) {
    return MarkdownWindowsNavigator.open(editorWindowModuleName, {
        props: launchArguments ? { launchArguments } : undefined,
        options: {
            ...createMarkdownEditorWindowStyle({ includeFrame: true })
        }
    });
}
export function closeMarkdownEditorWindow() {
    return closeWindow(editorWindowIdentifier);
}
export function showMarkdownEditorWindow() {
    return MarkdownWindowsNavigator.show(editorWindowModuleName);
}
export function setMarkdownEditorWindowOptions({ appearance, backgroundColor, filename, isDirty, isUntitledDocument, saveState, }: {
    appearance: "dark" | "light";
    backgroundColor: string;
    filename: string;
    isDirty: boolean;
    isUntitledDocument: boolean;
    saveState: MarkdownSaveState;
}) {
    return setWindowOptions(editorWindowIdentifier, {
        title: markdownEditorWindowTitle({ filename, isDirty, isUntitledDocument, saveState }),
        ...createMarkdownEditorWindowStyle({ appearance, backgroundColor, includeFrame: false })
    });
}
