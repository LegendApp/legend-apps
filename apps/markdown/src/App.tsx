import {
  openSelectedDocumentPath,
  useDocumentAppController,
  type DocumentAppController,
} from "@legend-desktop/document-app";
import type { NativeMenuAction, NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { useEffect } from "react";
import { editorWindowIdentifier, markdownFileTypes, markdownMenuOwnerId } from "./appConstants";
import {
  dispatchMarkdownEditorMenuAction,
  getMarkdownEditorRecentDocumentHandler,
} from "./markdownEditorActions";
import { isMarkdownPath, newMarkdownDocumentLaunchArgument } from "./markdownFiles";
import { markdownMenuConfig } from "./markdownMenus";
import { applyMarkdownThemeSetting } from "./markdownSettings";
import { loadMarkdownUserThemesSync } from "./userThemes";
import {
  openMarkdownEditorWindow,
  openMarkdownSettingsWindow,
  registerMarkdownWindows,
} from "./markdownWindows";

loadMarkdownUserThemesSync();
registerMarkdownWindows();

type MarkdownAppProps = {
  launchArguments?: string[];
};

function reportMarkdownAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[MarkdownAppController] ${message}`);
}

async function openMarkdownEditorForSelectedFile(controller: DocumentAppController) {
  const path = await openSelectedDocumentPath({
    allowedFileTypes: markdownFileTypes,
    invalidSelectionMessage: `Choose a Markdown file (${markdownFileTypes.map((type) => `.${type}`).join(", ")}).`,
    isDocumentPath: isMarkdownPath,
  });

  if (path) {
    await openMarkdownEditorWindow([path]);
    controller.setDocumentWindowOpen(true);
    return true;
  }

  return false;
}

async function openNewMarkdownEditorWindow(controller: DocumentAppController) {
  await openMarkdownEditorWindow([newMarkdownDocumentLaunchArgument]);
  controller.setDocumentWindowOpen(true);
}

function createMarkdownMenuHandlers(controller: DocumentAppController): NativeMenuActionHandlers {
  const dispatchOpenEditorMenuAction = (action: NativeMenuAction) =>
    controller.isDocumentWindowOpen() && dispatchMarkdownEditorMenuAction(action);

  return {
    new: (action: NativeMenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openNewMarkdownEditorWindow(controller)
          .catch(reportMarkdownAppControllerError);
      }
    },
    open: (action: NativeMenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openMarkdownEditorForSelectedFile(controller)
          .catch(reportMarkdownAppControllerError);
      }
    },
    settings: (action: NativeMenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openMarkdownSettingsWindow().catch(reportMarkdownAppControllerError);
      }
    },
    save: dispatchOpenEditorMenuAction,
    saveAs: dispatchOpenEditorMenuAction,
    revealInFinder: dispatchOpenEditorMenuAction,
    undo: dispatchOpenEditorMenuAction,
    redo: dispatchOpenEditorMenuAction,
    bold: dispatchOpenEditorMenuAction,
    italic: dispatchOpenEditorMenuAction,
    underline: dispatchOpenEditorMenuAction,
    strikethrough: dispatchOpenEditorMenuAction,
    spoiler: dispatchOpenEditorMenuAction,
    link: dispatchOpenEditorMenuAction,
    increaseFontSize: dispatchOpenEditorMenuAction,
    decreaseFontSize: dispatchOpenEditorMenuAction,
    resetFontSize: dispatchOpenEditorMenuAction,
  };
}

async function openRecentMarkdownDocument(path: string, controller: DocumentAppController) {
  if (isMarkdownPath(path)) {
    const editorHandler = controller.isDocumentWindowOpen() ? getMarkdownEditorRecentDocumentHandler() : null;
    if (editorHandler) {
      await editorHandler(path);
    } else {
      await openMarkdownEditorWindow([path]);
      controller.setDocumentWindowOpen(true);
    }
  }
}

async function openInitialMarkdownEditor(launchArguments: string[] | undefined, controller: DocumentAppController) {
  applyMarkdownThemeSetting();
  console.info("[MarkdownAppController] mounted in hidden host; opening editor window.");
  try {
    await openMarkdownEditorWindow(launchArguments);
    controller.setDocumentWindowOpen(true);
  } catch (error) {
    throw error instanceof Error ? new Error(`Unable to open editor window: ${error.message}`) : error;
  }
}

export function App({ launchArguments }: MarkdownAppProps) {
  useDocumentAppController({
    createMenuHandlers: createMarkdownMenuHandlers,
    launchArguments,
    menus: markdownMenuConfig,
    onInitialOpen: openInitialMarkdownEditor,
    onRecentDocumentOpen: openRecentMarkdownDocument,
    ownerId: markdownMenuOwnerId,
    reportError: reportMarkdownAppControllerError,
    windowIdentifier: editorWindowIdentifier,
  });

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  return null;
}

export default App;
