import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, type WindowsConfig } from "@legendapp/spark/windows";
import { showWindow, setWindowOptions } from "@legendapp/spark/windows";
import { cancelPreparedDocument, prepareDocument } from "@legend-apps/source-editor/preload";
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
                transparent: true
            }
        }
    };
}
function createCodeWindowsNavigator() {
    const { CodeViewerWindow } = require("./CodeViewerWindow") as typeof import("./CodeViewerWindow");
    const codeWindowsConfig = {
        [codeViewerWindowModuleName]: {
            component: CodeViewerWindow,
            id: codeViewerWindowIdentifier,
            options: {
                title: "Legend Code",
                ...createCodeViewerWindowStyle({ includeFrame: true }),
                macos: {
                    restoreOnLaunch: true, titleBar: { contentLayout: "fullSize", transparent: true }
                }
            },
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
export async function openCodeViewerWindow(launchArguments?: string[]) {
    const path = getLaunchCodeFile(launchArguments);
    const preparedDocumentId = path ? prepareDocument(path) : undefined;
    try {
        return await CodeWindowsNavigator.open(codeViewerWindowModuleName, {
            props: { launchArguments, preparedDocumentId },
            options: {
                ...createCodeViewerWindowStyle({ includeFrame: true })
            }
        });
    }
    catch (error) {
        cancelPreparedDocument(preparedDocumentId);
        throw error;
    }
}
export function focusCodeViewerWindow() {
    return showWindow(codeViewerWindowIdentifier);
}
export function setCodeViewerWindowOptions({ appearance, backgroundColor, filePath, }: {
    appearance: "dark" | "light";
    backgroundColor: string;
    filePath: string | null;
}) {
    return setWindowOptions(codeViewerWindowIdentifier, {
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
