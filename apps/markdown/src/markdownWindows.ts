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
const markdownWindowsConfig = {
    [editorWindowModuleName]: {
        loadComponent: () => import("./MarkdownEditorWindow"),
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
const MarkdownWindowsNavigator = createWindowsNavigator(markdownWindowsConfig);
type MarkdownWindow = keyof typeof markdownWindowsConfig;
export function registerMarkdownWindows() {
    // Importing this module registers the windows above.
}
export function openMarkdownSettingsWindow() {
    return MarkdownWindowsNavigator.open(settingsWindowModuleName as MarkdownWindow);
}
export function openMarkdownEditorWindow(launchArguments?: string[]) {
    return MarkdownWindowsNavigator.open(editorWindowModuleName as MarkdownWindow, {
        props: launchArguments ? { launchArguments } : undefined,
        options: {
            ...createMarkdownEditorWindowStyle({ includeFrame: true })
        }
    });
}
export function closeMarkdownEditorWindow() {
    return closeWindow(editorWindowIdentifier);
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
