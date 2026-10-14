import { beforeQuit } from "@legendapp/spark/app";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { useEffect, useLayoutEffect, useRef } from "react";
import { getRecentMarkdownFiles } from "./appMetadata";
import { getLaunchMarkdownFile, isMarkdownPath, shouldLaunchNewMarkdownDocument } from "./markdownFiles";
import { registerMarkdownEditorRecentDocumentHandler } from "./markdownEditorActions";
import { ownRegistration } from "@legend-apps/runtime-utils";
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
  windowId: string;
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
  windowId,
}: Pick<DocumentEventsOptions, "flushCurrentDocumentBeforeTransition" | "openSelectedFile" | "windowId">) {
  useEffect(() => {
    const unregister = registerMarkdownEditorRecentDocumentHandler(windowId, async (path: string) => {
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
  }, [flushCurrentDocumentBeforeTransition, openSelectedFile, windowId]);
}

export function useMarkdownAppExit({ autosaveEnabled, handleError, prepareCurrentDocumentForClose }: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose"> & { autosaveEnabled: boolean }) {
  useEffect(() => {
    let active = true;
    const subscription = ownRegistration(beforeQuit(() => active ? prepareCurrentDocumentForClose({ autosaveEnabled, reason: "quit" }) : false, { onError: handleError }), handleError);
    return () => { active = false; void subscription.remove().catch(handleError); };
  }, [autosaveEnabled, handleError, prepareCurrentDocumentForClose]);
}

export function useMarkdownWindowCloseRequest({ autosaveEnabled, handleError, prepareCurrentDocumentForClose, windowId }: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose" | "windowId"> & { autosaveEnabled: boolean }) {
  const latest = useRef({ autosaveEnabled, handleError, prepareCurrentDocumentForClose });
  useLayoutEffect(() => { latest.current = { autosaveEnabled, handleError, prepareCurrentDocumentForClose }; });
  useEffect(() => {
    let active = true;
    const report = (error: unknown) => latest.current.handleError(error);
    const subscription = ownRegistration(beforeWindowClose(windowId, () => active
      ? latest.current.prepareCurrentDocumentForClose({ autosaveEnabled: latest.current.autosaveEnabled, reason: "close" })
      : false, { onError: report }), report);
    return () => { active = false; void subscription.remove().catch(report); };
  }, [windowId]);
}
