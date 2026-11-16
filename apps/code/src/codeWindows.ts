import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, type WindowsConfig } from "@legendapp/spark/windows";
import { showWindow, setWindowOptions } from "@legendapp/spark/windows";
import { cancelPreparedDocument, prepareDocument } from "@legend-apps/source-editor/preload";
import { openDocumentWindow, type WorkspaceWindowProps } from "@legend-apps/workspace";
import { codeSettingsWindowIdentifier, codeSettingsWindowModuleName, codeViewerWindowIdentifier, codeViewerWindowModuleName, } from "./appConstants";
import { getCodeSyntaxTheme } from "./codeSettings";
import { getFilename, getLaunchCodeFile, getCodeRepresentedUri } from "./codeFiles";
import { SettingsWindow } from "./SettingsWindow";
import { openOrShowWindow } from "@legend-apps/runtime-utils";
function createCodeViewerWindowStyle({ appearance, backgroundColor, includeFrame, }: {
    appearance?: "dark" | "light";
    backgroundColor?: string;
    includeFrame: boolean;
}) {
    const syntaxTheme = getCodeSyntaxTheme();
    return {
        appearance: appearance ?? syntaxTheme.appearance,
        backgroundColor: backgroundColor ?? syntaxTheme.background,

        macos: {
            titleBar: {
                contentLayout: "fullSize" as const,
                transparent: true,
                titleVisibility: "hidden" as const
            }
        }
    };
}
function createCodeViewerWindowOptions() {
    return {
        title: "Legend Code",
        ...createCodeViewerWindowStyle({ includeFrame: true }),
        macos: {
            restoreOnLaunch: true, titleBar: { contentLayout: "fullSize" as const, transparent: true, titleVisibility: "hidden" as const }
        }
    };
}
function createCodeWindowsNavigator() {
    const { CodeViewerWindow } = require("./CodeViewerWindow") as typeof import("./CodeViewerWindow");
    const codeWindowsConfig = {
        [codeViewerWindowModuleName]: {
            component: CodeViewerWindow,
            id: codeViewerWindowIdentifier,
            options: createCodeViewerWindowOptions(),
        },
        [codeSettingsWindowModuleName]: {
            component: SettingsWindow,
            id: codeSettingsWindowIdentifier,
            options: createSettingsWindowOptions(),
        },
    } satisfies WindowsConfig;
    return createWindowsNavigator(codeWindowsConfig);
}
let CodeWindowsNavigator: ReturnType<typeof createCodeWindowsNavigator>;
export function registerCodeWindows() {
    CodeWindowsNavigator ??= createCodeWindowsNavigator();
}
export function openCodeSettingsWindow() {
    return openOrShowWindow(codeSettingsWindowIdentifier, () => CodeWindowsNavigator.open(codeSettingsWindowModuleName));
}
export type CodeViewerWindowProps = WorkspaceWindowProps & {
    launchArguments?: string[];
    preparedDocumentId?: string;
};
/** Opens a new viewer window; the first takes the restorable base ID and later ones are numbered. */
export async function openCodeViewerWindow({ launchArguments, ...props }: CodeViewerWindowProps = {}) {
    const path = props.files?.[0] ?? getLaunchCodeFile(launchArguments);
    const preparedDocumentId = path ? prepareDocument(path) : undefined;
    try {
        return await openDocumentWindow(codeViewerWindowIdentifier, {
            ...props, files: props.files ?? (path ? [path] : undefined), preparedDocumentId,
        }, createCodeViewerWindowOptions());
    }
    catch (error) {
        cancelPreparedDocument(preparedDocumentId);
        throw error;
    }
}
export function focusCodeViewerWindow(windowId = codeViewerWindowIdentifier) {
    return showWindow(windowId);
}
export function setCodeViewerWindowOptions({ appearance, backgroundColor, filePath, windowId, }: {
    appearance: "dark" | "light";
    backgroundColor: string;
    filePath: string | null;
    windowId: string;
}) {
    return setWindowOptions(windowId, {
        title: filePath ? getFilename(filePath) : "Legend Code",
        ...createCodeViewerWindowStyle({
            appearance,
            backgroundColor,
            includeFrame: false,
        }),
        macos: {
            representedUri: getCodeRepresentedUri(filePath)
        }
    });
}
