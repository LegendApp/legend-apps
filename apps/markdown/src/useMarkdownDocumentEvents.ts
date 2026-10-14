import { beforeQuit } from "@legendapp/spark/app";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { useEffect, useRef } from "react";
import { editorWindowIdentifier } from "./appConstants";
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

export function useMarkdownAppExit({ autosaveEnabled, handleError, prepareCurrentDocumentForClose }: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose"> & { autosaveEnabled: boolean }) {
  const latest = useRef({ autosaveEnabled, handleError, prepareCurrentDocumentForClose });
  latest.current = { autosaveEnabled, handleError, prepareCurrentDocumentForClose };
  const teardown = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    const onError = (error: unknown) => latest.current.handleError(error);
    const subscription = ownRegistration(teardown.current.then(() => beforeQuit(() => active
      ? latest.current.prepareCurrentDocumentForClose({ autosaveEnabled: latest.current.autosaveEnabled, reason: "quit" })
      : false, { onError })), onError);
    return () => {
      active = false;
      teardown.current = subscription.remove().catch(onError);
    };
  }, []);
}

export function useMarkdownWindowCloseRequest({ autosaveEnabled, handleError, prepareCurrentDocumentForClose }: Pick<DocumentEventsOptions, "handleError" | "prepareCurrentDocumentForClose"> & { autosaveEnabled: boolean }) {
  const latest = useRef({ autosaveEnabled, handleError, prepareCurrentDocumentForClose });
  latest.current = { autosaveEnabled, handleError, prepareCurrentDocumentForClose };
  const teardown = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    const onError = (error: unknown) => latest.current.handleError(error);
    const subscription = ownRegistration(teardown.current.then(() => beforeWindowClose(editorWindowIdentifier, () => active
      ? latest.current.prepareCurrentDocumentForClose({ autosaveEnabled: latest.current.autosaveEnabled, reason: "close" })
      : false, { onError })), onError);
    return () => {
      active = false;
      teardown.current = subscription.remove().catch(onError);
    };
  }, []);
}
