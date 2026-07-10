import {
  openSelectedDocumentPath,
  useDocumentAppController,
  type DocumentAppController,
} from "@legend-apps/document-app";
import type { NativeMenuActionHandlers } from "@legend-apps/native-menu";
import { closeWindow } from "@legend-apps/window-manager";
import { useEffect } from "react";
import { codeFileTypes, codeMenuOwnerId, codeViewerWindowIdentifier } from "./appConstants";
import { installCodeBenchmarkHook } from "./codeBenchmark";
import { getLaunchCodeFile, isCodePath } from "./codeFiles";
import { codeMenuConfig } from "./codeMenus";
import { focusCodeViewerWindow, openCodeSettingsWindow, openCodeViewerWindow, registerCodeWindows } from "./codeWindows";
import { requestCodeViewerFile } from "./codeViewerRequests";

registerCodeWindows();
installCodeBenchmarkHook();

declare global {
  var __legendCodeBenchmarkOpenFile: ((filePath: string) => Promise<void>) | undefined;
  var __legendCodeBenchmarkCloseFile: (() => Promise<void>) | undefined;
  var __legendCodeBenchmarkGetTokenizedLineCount: (() => number) | undefined;
}

type CodeAppProps = {
  launchArguments?: string[];
};

function reportCodeAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[CodeAppController] ${message}`);
}

if (__DEV__) {
  globalThis.__legendCodeBenchmarkCloseFile = async () => {
    await closeWindow(codeViewerWindowIdentifier);
  };
}

async function openCodeFileInViewer(filePath: string, isViewerOpen: boolean) {
  if (isViewerOpen) {
    requestCodeViewerFile(filePath);
    await focusCodeViewerWindow();
  } else {
    await openCodeViewerWindow([filePath]);
  }
}

async function openCodeViewerForSelectedFile(controller: DocumentAppController) {
  const path = await openSelectedDocumentPath({
    allowedFileTypes: codeFileTypes,
    invalidSelectionMessage: `Choose a TypeScript file (${codeFileTypes.map((type) => `.${type}`).join(", ")}).`,
    isDocumentPath: isCodePath,
  });

  if (path) {
    await openCodeFileInViewer(path, controller.isDocumentWindowOpen());
    controller.setDocumentWindowOpen(true);
    return true;
  }

  return false;
}

function createCodeMenuHandlers(controller: DocumentAppController): NativeMenuActionHandlers {
  return {
    open: () => {
      openCodeViewerForSelectedFile(controller)
        .catch(reportCodeAppControllerError);
    },
    settings: () => {
      openCodeSettingsWindow().catch(reportCodeAppControllerError);
    },
  };
}

async function openRecentCodeDocument(path: string, controller: DocumentAppController) {
  if (isCodePath(path)) {
    await openCodeFileInViewer(path, controller.isDocumentWindowOpen());
    controller.setDocumentWindowOpen(true);
  }
}

async function openInitialCodeViewer(launchArguments: string[] | undefined, controller: DocumentAppController) {
  const launchFile = getLaunchCodeFile(launchArguments);
  await openCodeViewerWindow(launchFile ? [launchFile] : launchArguments);
  controller.setDocumentWindowOpen(true);
}

export function App({ launchArguments }: CodeAppProps) {
  const controller = useDocumentAppController({
    createMenuHandlers: createCodeMenuHandlers,
    launchArguments,
    menus: codeMenuConfig,
    onInitialOpen: openInitialCodeViewer,
    onRecentDocumentOpen: openRecentCodeDocument,
    ownerId: codeMenuOwnerId,
    reportError: reportCodeAppControllerError,
    windowIdentifier: codeViewerWindowIdentifier,
  });

  useEffect(() => {
    if (__DEV__) {
      globalThis.__legendCodeBenchmarkOpenFile = async (filePath: string) => {
        await openCodeFileInViewer(filePath, controller.isDocumentWindowOpen());
        controller.setDocumentWindowOpen(true);
      };
    }

    return () => {
      if (__DEV__ && globalThis.__legendCodeBenchmarkOpenFile) {
        globalThis.__legendCodeBenchmarkOpenFile = undefined;
      }
    };
  }, [controller]);

  return null;
}

export default App;
