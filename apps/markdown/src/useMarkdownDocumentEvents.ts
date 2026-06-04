import { addAppExitListener, completeAppExit } from "@legend-desktop/app-exit";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { useEffect, useRef } from "react";
import { getRecentMarkdownFiles } from "./appMetadata";
import { getLaunchMarkdownFile, isMarkdownPath } from "./markdownFiles";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "./markdownSettings";

type DocumentEventsOptions = {
  flushCurrentDocumentBeforeTransition: (reason?: "open" | "quit") => Promise<boolean>;
  handleError: (error: unknown) => void;
  launchArguments?: string[];
  openSelectedFile: (path: string) => void;
  openUntitledDocument: () => void;
};

function getStartupMarkdownPath(launchArguments: string[] | undefined) {
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
  handleError,
  openSelectedFile,
}: Pick<DocumentEventsOptions, "flushCurrentDocumentBeforeTransition" | "handleError" | "openSelectedFile">) {
  useEffect(() => {
    async function openRecentDocument(path: string) {
      if (!isMarkdownPath(path)) {
        return;
      }

      const didFlush = await flushCurrentDocumentBeforeTransition("open");
      if (didFlush) {
        openSelectedFile(path);
      }
    }

    const subscription = addRecentDocumentOpenListener(({ path }) => {
      openRecentDocument(path).catch(handleError);
    });

    return () => {
      subscription.remove();
    };
  }, [flushCurrentDocumentBeforeTransition, handleError, openSelectedFile]);
}

export function useMarkdownAppExit({
  flushCurrentDocumentBeforeTransition,
  handleError,
}: Pick<DocumentEventsOptions, "flushCurrentDocumentBeforeTransition" | "handleError">) {
  useEffect(() => {
    async function completeRequestedExit() {
      try {
        const didFlush = await flushCurrentDocumentBeforeTransition("quit");
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
  }, [flushCurrentDocumentBeforeTransition, handleError]);
}
