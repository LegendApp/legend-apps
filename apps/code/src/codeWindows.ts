import { createSettingsWindowOptions } from "@legend-apps/settings-window";
import { createDocumentWindowStyle, createWindowsNavigator, type WindowsConfig } from "@legend-apps/windows";
import { openWindow, setWindowOptions } from "@legend-apps/window-manager";
import { cancelPreparedDocument, prepareDocument } from "@legend-apps/source-editor/preload";
import {
  codeSettingsWindowIdentifier,
  codeSettingsWindowModuleName,
  codeViewerWindowIdentifier,
  codeViewerWindowModuleName,
} from "./appConstants";
import { getCodeSyntaxTheme } from "./codeSettings";
import { getFilename, getLaunchCodeFile } from "./codeFiles";
import { SettingsWindow } from "./SettingsWindow";

function createCodeViewerWindowStyle({
  appearance,
  backgroundColor,
  includeFrame,
}: {
  appearance?: "dark" | "light";
  backgroundColor?: string;
  includeFrame: boolean;
}) {
  const syntaxTheme = getCodeSyntaxTheme();

  return createDocumentWindowStyle({
    appearance: appearance ?? syntaxTheme.appearance,
    backgroundColor: backgroundColor ?? syntaxTheme.background,
    frame: {
      width: 1080,
      height: 760,
      minWidth: 560,
      minHeight: 420,
    },
    includeFrame,
  });
}

const codeWindowsConfig = {
  [codeViewerWindowModuleName]: {
    loadComponent: () => import("./CodeViewerWindow"),
    identifier: codeViewerWindowIdentifier,
    options: {
      restoreOnLaunch: true,
      interceptClose: true,
      title: "Legend Code",
      windowStyle: createCodeViewerWindowStyle({ includeFrame: true }),
    },
  },
  [codeSettingsWindowModuleName]: {
    component: SettingsWindow,
    identifier: codeSettingsWindowIdentifier,
    options: createSettingsWindowOptions(),
  },
} satisfies WindowsConfig;

const CodeWindowsNavigator = createWindowsNavigator(codeWindowsConfig);

type CodeWindow = keyof typeof codeWindowsConfig;

export function registerCodeWindows() {
  // Importing this module registers the windows above.
}

export function openCodeSettingsWindow() {
  return CodeWindowsNavigator.open(codeSettingsWindowModuleName as CodeWindow);
}

export async function openCodeViewerWindow(launchArguments?: string[]) {
  const path = getLaunchCodeFile(launchArguments);
  const preparedDocumentId = path ? prepareDocument(path) : undefined;
  try {
    return await CodeWindowsNavigator.open(codeViewerWindowModuleName as CodeWindow, {
      initialProperties: { launchArguments, preparedDocumentId },
      windowStyle: createCodeViewerWindowStyle({ includeFrame: true }),
    });
  } catch (error) {
    cancelPreparedDocument(preparedDocumentId);
    throw error;
  }
}

export function focusCodeViewerWindow() {
  return openWindow({
    identifier: codeViewerWindowIdentifier,
    moduleName: codeViewerWindowModuleName,
  });
}

export function setCodeViewerWindowOptions({
  appearance,
  backgroundColor,
  filePath,
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  filePath: string | null;
}) {
  return setWindowOptions(codeViewerWindowIdentifier, {
    representedURL: filePath,
    title: filePath ? getFilename(filePath) : "Legend Code",
    windowStyle: createCodeViewerWindowStyle({
      appearance,
      backgroundColor,
      includeFrame: false,
    }),
  });
}
