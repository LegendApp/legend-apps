import {
  openSelectedDocumentPath,
  useDocumentAppController,
  type DocumentAppController,
} from "@legendapp/spark/app/documents";
import type { MenuAction } from "@legendapp/spark/menus";
import { useValue } from "@legendapp/state/react";
import { withMenuState } from "@legend-apps/runtime-utils";
import { createWorkspaceMenuHandlers } from "@legend-apps/workspace";
import { useEffect } from "react";
import { editorWindowIdentifier, markdownFileTypes, markdownMenuOwnerId } from "./appConstants";
import {
  dispatchMarkdownEditorMenuAction,
  getMarkdownEditorRecentDocumentHandler,
} from "./markdownEditorActions";
import { isMarkdownPath, newMarkdownDocumentLaunchArgument } from "./markdownFiles";
import { markdownMenuConfig, markdownMenuState$ } from "./markdownMenus";
import { applyMarkdownThemeSetting } from "./markdownSettings";
import { loadMarkdownUserThemesSync } from "./userThemes";
import {
  openMarkdownEditorWindow,
  openMarkdownSettingsWindow,
  registerMarkdownWindows,
  showMarkdownEditorWindow,
} from "./markdownWindows";

loadMarkdownUserThemesSync();
registerMarkdownWindows();

type MenuHandlers = Record<string, (action: MenuAction) => unknown>;

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
    await openMarkdownEditorWindow({ files: [path] });
    controller.setDocumentWindowOpen(true);
    return true;
  }

  return false;
}

async function openNewMarkdownEditorWindow(controller: DocumentAppController) {
  await openMarkdownEditorWindow({ launchArguments: [newMarkdownDocumentLaunchArgument] });
  controller.setDocumentWindowOpen(true);
}

function createMarkdownMenuHandlers(controller: DocumentAppController): MenuHandlers {
  const dispatchOpenEditorMenuAction = (action: MenuAction) =>
    controller.isDocumentWindowOpen() && dispatchMarkdownEditorMenuAction(action);

  return {
    // New, folder, and workspace windows start on an untitled document rather than the last one.
    ...createWorkspaceMenuHandlers(async (props) => {
      await openMarkdownEditorWindow({ launchArguments: [newMarkdownDocumentLaunchArgument], ...props });
      controller.setDocumentWindowOpen(true);
    }, reportMarkdownAppControllerError),
    new: (action: MenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openNewMarkdownEditorWindow(controller)
          .catch(reportMarkdownAppControllerError);
      }
    },
    open: (action: MenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openMarkdownEditorForSelectedFile(controller)
          .catch(reportMarkdownAppControllerError);
      }
    },
    settings: (action: MenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openMarkdownSettingsWindow().catch(reportMarkdownAppControllerError);
      }
    },
    save: dispatchOpenEditorMenuAction,
    saveAs: dispatchOpenEditorMenuAction,
    saveWorkspace: dispatchOpenEditorMenuAction,
    toggleSidebar: dispatchOpenEditorMenuAction,
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
      await openMarkdownEditorWindow({ files: [path] });
      controller.setDocumentWindowOpen(true);
    }
  }
}

async function openInitialMarkdownEditor(launchArguments: string[] | undefined, controller: DocumentAppController) {
  applyMarkdownThemeSetting();
  console.info("[MarkdownAppController] mounted in hidden host; opening editor window.");
  try {
    await openMarkdownEditorWindow({ launchArguments });
    controller.setDocumentWindowOpen(true);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "E_ALREADY_EXISTS") {
      await showMarkdownEditorWindow();
      controller.setDocumentWindowOpen(true);
      return;
    }
    throw error instanceof Error ? new Error(`Unable to open editor window: ${error.message}`) : error;
  }
}

export function App({ launchArguments }: MarkdownAppProps) {
  const menuState = useValue(markdownMenuState$);
  const menus = withMenuState(markdownMenuConfig, menuState);
  useDocumentAppController({
    onMenuAction: (action, controller) => { if (action.type === "action") createMarkdownMenuHandlers(controller)[action.itemId]?.(action); },
    launchArguments,
    menus,
    onInitialOpen: openInitialMarkdownEditor,
    onOpenDocument: openRecentMarkdownDocument,
    ownerId: markdownMenuOwnerId,
    reportError: reportMarkdownAppControllerError,
    windowId: editorWindowIdentifier,
  });

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  return null;
}

export default App;
