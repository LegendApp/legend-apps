import { beforeQuit } from "@legendapp/spark/app";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { useEffect, useRef } from "react";
import { getRecentMarkdownFiles } from "./appMetadata";
import { getLaunchMarkdownFile, isMarkdownPath, shouldLaunchNewMarkdownDocument } from "./markdownFiles";
import { registerMarkdownEditorRecentDocumentHandler } from "./markdownEditorActions";
import { ownRegistration } from "@legend-apps/runtime-utils";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "./markdownSettings";

export function getStartupMarkdownPath(launchArguments: string[] | undefined) {
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

export function useRecentMarkdownDocumentOpener({
  openSelectedFile,
  windowId,
}: { openSelectedFile: (path: string) => void; windowId: string }) {
  useEffect(() => {
    const unregister = registerMarkdownEditorRecentDocumentHandler(windowId, async (path: string) => {
      if (!isMarkdownPath(path)) {
        return;
      }

      openSelectedFile(path);
    });

    return () => {
      unregister();
    };
  }, [openSelectedFile, windowId]);
}

type WindowQuitGuard = { prepare: () => Promise<boolean>; discardDrafts: () => void };

const windowQuitGuards = new Set<WindowQuitGuard>();

export function registerMarkdownWindowQuitGuard(guard: WindowQuitGuard) {
  windowQuitGuards.add(guard);
  return () => { windowQuitGuards.delete(guard); };
}

export function useMarkdownAppExit(handleError: (error: unknown) => void) {
  const handleErrorRef = useRef(handleError);
  handleErrorRef.current = handleError;
  const teardown = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    const onError = (error: unknown) => handleErrorRef.current(error);
    const subscription = ownRegistration(teardown.current.then(() => beforeQuit(async () => {
      const guards = [...windowQuitGuards];
      for (const guard of guards) {
        if (!active || !await guard.prepare()) return false;
      }
      if (!active) return false;
      for (const guard of guards) {
        if (!windowQuitGuards.has(guard)) continue;
        try {
          guard.discardDrafts();
        } catch (error) {
          onError(error);
        }
      }
      return true;
    }, { onError })), onError);
    return () => {
      active = false;
      teardown.current = subscription.remove().catch(onError);
    };
  }, []);
}

export function useMarkdownWindowCloseRequest({
  handleError,
  prepareWindowForClose,
  windowId,
}: {
  handleError: (error: unknown) => void;
  prepareWindowForClose: () => Promise<boolean>;
  windowId: string | undefined;
}) {
  const latest = useRef({ handleError, prepareWindowForClose });
  latest.current = { handleError, prepareWindowForClose };
  const teardown = useRef(Promise.resolve());
  useEffect(() => {
    if (windowId === undefined) return;
    let active = true;
    const onError = (error: unknown) => latest.current.handleError(error);
    const subscription = ownRegistration(teardown.current.then(() => beforeWindowClose(windowId, () => active
      ? latest.current.prepareWindowForClose()
      : false, { onError })), onError);
    return () => {
      active = false;
      teardown.current = subscription.remove().catch(onError);
    };
  }, [windowId]);
}
