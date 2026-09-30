import {
  openSelectedDocumentPath,
  useDocumentAppController,
  type DocumentAppController,
} from "@legendapp/spark/app/documents";
import type { MenuAction } from "@legendapp/spark/menus";
import { closeWindow } from "@legendapp/spark/windows";
import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { useEffect } from "react";
import { codeFileTypes, codeMenuOwnerId, codeViewerWindowIdentifier } from "./appConstants";
import { installCodeBenchmarkHook } from "./codeBenchmark";
import { getLaunchCodeFile, isCodePath } from "./codeFiles";
import { codeMenuConfig } from "./codeMenus";
import { focusCodeViewerWindow, openCodeSettingsWindow, openCodeViewerWindow, registerCodeWindows } from "./codeWindows";
import { requestCodeViewerFile, dispatchCodeViewerMenu, codeAutomaticPairs$ } from "./codeViewerRequests";

registerCodeWindows();
installCodeBenchmarkHook();

declare global {
  var __legendCodeBenchmarkOpenFile: ((filePath: string) => Promise<void>) | undefined;
  var __legendCodeBenchmarkCloseFile: (() => Promise<void>) | undefined;
  var __legendCodeBenchmarkGetTokenizedLineCount: (() => number) | undefined;
}

type MenuHandlers = Record<string, (action: MenuAction) => unknown>;

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
    invalidSelectionMessage: "Choose a text file.",
    isDocumentPath: isCodePath,
  });

  if (path) {
    await openCodeFileInViewer(path, controller.isDocumentWindowOpen());
    controller.setDocumentWindowOpen(true);
    return true;
  }

  return false;
}

function createCodeMenuHandlers(controller: DocumentAppController): MenuHandlers {
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
  const automaticPairs = useValue(codeAutomaticPairs$);
  const menus = useMemo(() => codeMenuConfig.map(item => item.type === "submenu" ? { ...item, items: item.items.map(child => child.type === "checkbox" && child.id === "automaticPairs" ? { ...child, checked: automaticPairs } : child) } : item), [automaticPairs]);
  const controllerState = useDocumentAppController({
    onMenuAction: (action, controller) => { if (action.type === "action") { const handler = createCodeMenuHandlers(controller)[action.itemId]; if (handler) handler(action); else dispatchCodeViewerMenu(action.itemId); } },
    launchArguments,
    menus,
    onInitialOpen: openInitialCodeViewer,
    onOpenDocument: openRecentCodeDocument,
    ownerId: codeMenuOwnerId,
    reportError: reportCodeAppControllerError,
    windowId: codeViewerWindowIdentifier,
  });

  const controller = controllerState.status === "ready" ? controllerState.controller : undefined;
  useEffect(() => {
    if (__DEV__ && controller) {
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
