import { addAppExitListener, completeAppExit } from "@legend-desktop/app-exit";
import { addWindowCloseRequestedListener } from "@legend-desktop/window-manager";
import { useEffect, useRef } from "react";
import { editorWindowIdentifier } from "./appConstants";
import { getRecentMarkdownFiles } from "./appMetadata";
import { getLaunchMarkdownFile, isMarkdownPath, shouldLaunchNewMarkdownDocument } from "./markdownFiles";
import { registerMarkdownEditorRecentDocumentHandler } from "./markdownEditorActions";
import { closeMarkdownEditorWindow } from "./markdownWindows";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "./markdownSettings";

type DocumentEventsOptions = {
  flushCurrentDocumentBeforeTransition: (reason?: "new" | "open" | "quit") => Promise<boolean>;
  handleError: (error: unknown) => void;
  launchArguments?: string[];
  openSelectedFile: (path: string) => void;
  openUntitledDocument: () => void;
  prepareCurrentDocumentForClose: (options: { autosaveEnabled: boolean; reason?: "close" | "quit" }) => Promise<boolean>;
};

function getStartupMarkdownPath(launchArguments: string[] | undefined) {
  if (shouldLaunchNewMarkdownDocument(launchArguments)) {
    return null;
  }

  const launchFile = getLaunchMarkdownFile(launchArguments);
  if (launchFile) {
    return launchFile;
  }

  if (getMarkdownStartupBehaviorSetting() !== "lastDocument") {
    return null;
  }

  return getLastMarkdownDocumentPath()
    ?? getRecentMarkdownFiles().find((file) => isMarkdownPath(file.path))?.path
    ?? null;
}

export function useMarkdownStartupDocument({
  launchArguments,
  openSelectedFile,
  openUntitledDocument,
}: Pick<DocumentEventsOptions, "launchArguments" | "openSelectedFile" | "openUntitledDocument">) {
  const startupHandledRef = useRef(false);

  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;

    const startupPath = getStartupMarkdownPath(launchArguments);
    if (startupPath) {
      openSelectedFile(startupPath);
    } else {
      openUntitledDocument();
    }
  }, [launchArguments, openSelectedFile, openUntitledDocument]);
}

export function useRecentMarkdownDocumentOpener({
  flushCurrentDocumentBeforeTransition,
  openSelectedFile,
}: Pick<DocumentEventsOptions, "flushCurrentDocumentBeforeTransition" | "openSelectedFile">) {
  useEffect(() => {
    const unregister = registerMarkdownEditorRecentDocumentHandler(async (path: string) => {
      if (!isMarkdownPath(path)) {
        return;
      }

      const didFlush = await flushCurrentDocumentBeforeTransition("open");
      if (didFlush) {
        openSelectedFile(path);
      }
    });

    return () => {
      unregister();
    };
  }, [flushCurrentDocumentBeforeTransition, openSelectedFile]);
}

export function useMarkdownAppExit({
  autosaveEnabled,
  handleError,
  prepareCurrentDocumentForClose,
}: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose"> & {
  autosaveEnabled: boolean;
}) {
  useEffect(() => {
    async function completeRequestedExit() {
      try {
        const didFlush = await prepareCurrentDocumentForClose({ autosaveEnabled, reason: "quit" });
        completeAppExit(didFlush);
      } catch (error) {
        handleError(error);
        completeAppExit(false);
      }
    }

    const subscription = addAppExitListener((event) => {
      if (event.reason === "requested") {
        completeRequestedExit().catch(handleError);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [autosaveEnabled, handleError, prepareCurrentDocumentForClose]);
}

export function useMarkdownWindowCloseRequest({
  autosaveEnabled,
  handleError,
  prepareCurrentDocumentForClose,
}: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose"> & {
  autosaveEnabled: boolean;
}) {
  const closeInFlightRef = useRef(false);

  useEffect(() => {
    async function closeRequestedWindow() {
      if (closeInFlightRef.current) {
        return;
      }

      closeInFlightRef.current = true;

      try {
        const canClose = await prepareCurrentDocumentForClose({ autosaveEnabled });
        if (canClose) {
          await closeMarkdownEditorWindow();
        }
      } catch (error) {
        handleError(error);
      } finally {
        closeInFlightRef.current = false;
      }
    }

    const subscription = addWindowCloseRequestedListener((event) => {
      if (event.identifier === editorWindowIdentifier) {
        closeRequestedWindow().catch(handleError);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [autosaveEnabled, handleError, prepareCurrentDocumentForClose]);
}
