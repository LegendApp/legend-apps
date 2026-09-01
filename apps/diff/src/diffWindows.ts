import { createSettingsWindowOptions } from "@legend-apps/settings-window/options";
import { createWindowsNavigator, type WindowsConfig } from "@legend-apps/windows";
import type { WindowFrame } from "@legend-apps/window-manager";
import {
  diffSettingsWindowIdentifier,
  diffSettingsWindowModuleName,
  diffViewerWindowIdentifier,
  diffViewerWindowModuleName,
} from "./appConstants";
import { upsertSavedDiffWindow } from "./diffAppMetadata";
import { getDiffRepresentedUrl, normalizeDiffOpenSource, type DiffOpenSource } from "./diffFiles";
import { createDiffViewerWindowStyle } from "./diffWindowControls";
import { diffViewerWindowTitle } from "./diffWindowTitle";

let diffViewerUntitledWindowId = 0;
let diffViewerUrlFocusRequestId = 0;

const diffWindowsConfig = {
  [diffViewerWindowModuleName]: {
    identifier: diffViewerWindowIdentifier,
    loadComponent: () => import("./DiffViewerWindowShell").then((module) => module.DiffViewerWindowShell),
    options: {
      title: "Legend Diff",
      transparentBackground: true,
      windowStyle: createDiffViewerWindowStyle({ includeFrame: true }),
    },
  },
  [diffSettingsWindowModuleName]: {
    identifier: diffSettingsWindowIdentifier,
    loadComponent: () => import("./SettingsWindow").then((module) => module.SettingsWindow),
    options: createSettingsWindowOptions({ title: "Settings" }),
  },
} satisfies WindowsConfig;

const DiffWindowsNavigator = createWindowsNavigator(diffWindowsConfig);

type DiffWindow = keyof typeof diffWindowsConfig;

export type DiffViewerWindowOpenOptions = {
  focusUrlInput?: boolean;
  frame?: WindowFrame;
  freshWindow?: boolean;
  windowIdentifier?: string;
};

export function registerDiffWindows() {
  // Importing this module registers the windows above.
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

export function openDiffViewerWindow(sourceInput?: DiffOpenSource | string | null, options: DiffViewerWindowOpenOptions = {}) {
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
  if (options.frame) {
    windowStyle.width = options.frame.width;
    windowStyle.height = options.frame.height;
  }

  return DiffWindowsNavigator.open(diffViewerWindowModuleName as DiffWindow, {
    identifier: windowIdentifier,
    initialProperties,
    interceptClose: true,
    loadComponentBeforeNativeOpen: false,
    representedURL: getDiffRepresentedUrl(source),
    title: diffViewerWindowTitle({ hasUnsavedMergeDrafts: false, source }),
    transparentBackground: true,
    ...(options.frame ? { x: options.frame.x, y: options.frame.y } : {}),
    windowStyle,
  }).then((result) => {
    upsertSavedDiffWindow({
      ...(options.frame ? { frame: options.frame } : {}),
      id: windowIdentifier,
      ...(source ? { source } : {}),
    });
    return result;
  });
}

export function openDiffSettingsWindow() {
  return DiffWindowsNavigator.open(diffSettingsWindowModuleName as DiffWindow);
}
