import { AppRegistry } from "react-native";
import { createElement, type ComponentType } from "react";
import type { DiffViewerWindowProps } from "./DiffViewerWindow";
import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, openWindow, WindowProvider, type WindowsConfig } from "@legendapp/spark/windows";
import type { WindowBounds } from "@legendapp/spark/windows";
import { diffSettingsWindowIdentifier, diffSettingsWindowModuleName, diffViewerWindowIdentifier, diffViewerWindowModuleName, } from "./appConstants";
import { upsertSavedDiffWindow } from "./diffAppMetadata";
import { getDiffRepresentedUrl, normalizeDiffOpenSource, type DiffOpenSource } from "./diffFiles";
import { createDiffViewerWindowStyle } from "./diffWindowControls";
import { getDiffRestoreWindowsOnStartupSetting } from "./diffSettings";
import { diffViewerWindowTitle } from "./diffWindowTitle";
let diffViewerUntitledWindowId = 0;
let diffViewerUrlFocusRequestId = 0;
const diffWindowsConfig = {
    [diffSettingsWindowModuleName]: {
        id: diffSettingsWindowIdentifier,
        loadComponent: () => import("./SettingsWindow").then((module) => module.SettingsWindow),
        options: createSettingsWindowOptions({ title: "Settings" }),
    },
} satisfies WindowsConfig;
const DiffWindowsNavigator = createWindowsNavigator(diffWindowsConfig);
type DiffWindow = keyof typeof diffWindowsConfig;
export type DiffViewerWindowOpenOptions = {
    focusUrlInput?: boolean;
    /** One-time migration input; AppKit owns subsequent frame persistence. */
    frame?: WindowBounds;
    freshWindow?: boolean;
    windowIdentifier?: string;
};
let viewer: ComponentType<DiffViewerWindowProps> | undefined;
let loading: Promise<void> | undefined;
AppRegistry.registerComponent(diffViewerWindowModuleName, () => (props: DiffViewerWindowProps) => {
    if (!viewer) throw new Error("Diff viewer has not loaded");
    return createElement(WindowProvider, { id: props.windowIdentifier ?? diffViewerWindowIdentifier, children: createElement(viewer, props) });
});
export function registerDiffWindows() {}
async function loadViewer() {
    loading ??= import("./DiffViewerWindowShell").then(module => { viewer = module.DiffViewerWindowShell; }).catch(error => { loading = undefined; throw error; });
    await loading;
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(36);
}
export function getDiffViewerWindowIdentifier(source: DiffOpenSource | null | undefined) {
    return source ? `${diffViewerWindowIdentifier}-${source.kind}-${hashString(source.value)}` : diffViewerWindowIdentifier;
}
function getFreshDiffViewerWindowIdentifier() {
    diffViewerUntitledWindowId += 1;
    return `${diffViewerWindowIdentifier}-untitled-${diffViewerUntitledWindowId}`;
}
export async function openDiffViewerWindow(sourceInput?: DiffOpenSource | string | null, options: DiffViewerWindowOpenOptions = {}) {
    const source = normalizeDiffOpenSource(sourceInput);
    const windowIdentifier = options.windowIdentifier ??
        (options.freshWindow && source === null
            ? getFreshDiffViewerWindowIdentifier()
            : getDiffViewerWindowIdentifier(source));
    const shouldShowSourceToolbar = source !== null;
    const focusUrlInputRequestId = options.focusUrlInput ? ++diffViewerUrlFocusRequestId : undefined;
    const shouldPassWindowIdentifier = windowIdentifier !== diffViewerWindowIdentifier;
    const initialProperties = source || options.focusUrlInput || shouldPassWindowIdentifier
        ? {
            ...(source ? { source } : {}),
            ...(focusUrlInputRequestId ? { focusUrlInputRequestId } : {}),
            ...(shouldPassWindowIdentifier ? { windowIdentifier } : {}),
        }
        : undefined;
    const windowStyle = createDiffViewerWindowStyle({
        includeFrame: true,
        showSidebarControl: shouldShowSourceToolbar,
        showViewModeToolbar: shouldShowSourceToolbar,
        source,
    });
    await loadViewer();
    return openWindow({
        ...windowStyle,
        id: windowIdentifier,
        component: diffViewerWindowModuleName,
        props: initialProperties,
        title: diffViewerWindowTitle({ hasUnsavedMergeDrafts: false, source }),
        transparent: true,
        ...(options.frame ? { size: { width: options.frame.width, height: options.frame.height }, position: { displayId: options.frame.displayId, x: options.frame.x, y: options.frame.y } } : {}),
        macos: { ...windowStyle.macos, representedUri: getDiffRepresentedUrl(source), restoreOnLaunch: getDiffRestoreWindowsOnStartupSetting() },
    }).then((result) => {
        upsertSavedDiffWindow({
            id: windowIdentifier,
            ...(source ? { source } : {}),
        });
        return result;
    });
}
export function openDiffSettingsWindow() {
    return DiffWindowsNavigator.open(diffSettingsWindowModuleName as DiffWindow);
}
