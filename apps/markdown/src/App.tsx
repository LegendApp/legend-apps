import { openFileDialog } from "@legend-desktop/file-dialog";
import { useNativeMenu, type NativeMenuAction, type NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { addWindowClosedListener } from "@legend-desktop/window-manager";
import { useEffect, useRef } from "react";
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

async function openMarkdownEditorForSelectedFile() {
  const paths = await openFileDialog({
    allowedFileTypes: markdownFileTypes,
    canChooseFiles: true,
  });
  const path = paths?.find(isMarkdownPath) ?? null;

  if (path) {
    await openMarkdownEditorWindow([path]);
    return true;
  }

  if (paths && paths.length > 0) {
    throw new Error(`Choose a Markdown file (${markdownFileTypes.map((type) => `.${type}`).join(", ")}).`);
  }

  return false;
}

function openNewMarkdownEditorWindow() {
  return openMarkdownEditorWindow([newMarkdownDocumentLaunchArgument]);
}

export function App({ launchArguments }: MarkdownAppProps) {
  const didOpenEditorRef = useRef(false);
  const editorWindowOpenRef = useRef(false);
  const dispatchOpenEditorMenuAction = (action: NativeMenuAction) =>
    editorWindowOpenRef.current && dispatchMarkdownEditorMenuAction(action);
  const menuHandlers = useRef<NativeMenuActionHandlers>({
    new: (action: NativeMenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openNewMarkdownEditorWindow()
          .then(() => {
            editorWindowOpenRef.current = true;
          })
          .catch(reportMarkdownAppControllerError);
      }
    },
    open: (action: NativeMenuAction) => {
      if (!dispatchOpenEditorMenuAction(action)) {
        openMarkdownEditorForSelectedFile()
          .then((didOpen) => {
            if (didOpen) {
              editorWindowOpenRef.current = true;
            }
          })
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
  }).current;

  useNativeMenu({
    handlers: menuHandlers,
    menus: markdownMenuConfig,
    ownerId: markdownMenuOwnerId,
  });

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  useEffect(() => {
    const subscription = addRecentDocumentOpenListener(({ path }) => {
      if (!isMarkdownPath(path)) {
        return;
      }

      const editorHandler = editorWindowOpenRef.current ? getMarkdownEditorRecentDocumentHandler() : null;
      if (editorHandler) {
        editorHandler(path).catch(reportMarkdownAppControllerError);
      } else {
        openMarkdownEditorWindow([path])
          .then(() => {
            editorWindowOpenRef.current = true;
          })
          .catch(reportMarkdownAppControllerError);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = addWindowClosedListener((event) => {
      if (event.identifier === editorWindowIdentifier) {
        editorWindowOpenRef.current = false;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!didOpenEditorRef.current) {
      didOpenEditorRef.current = true;
      applyMarkdownThemeSetting();
      console.info("[MarkdownAppController] mounted in hidden host; opening editor window.");
      openMarkdownEditorWindow(launchArguments)
        .then(() => {
          editorWindowOpenRef.current = true;
        })
        .catch((error: unknown) => {
          reportMarkdownAppControllerError(
            error instanceof Error ? new Error(`Unable to open editor window: ${error.message}`) : error,
          );
        });
    }
  }, [launchArguments]);

  return null;
}

export default App;
