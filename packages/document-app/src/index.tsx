import { openFileDialog } from "@legend-desktop/file-dialog";
import { useNativeMenu, type NativeMenuActionHandlers, type NativeMenuConfig } from "@legend-desktop/native-menu";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { addWindowClosedListener } from "@legend-desktop/window-manager";
import { useEffect, useMemo, useRef, useState } from "react";

export type DocumentAppController = {
  isDocumentWindowOpen: () => boolean;
  reportError: (error: unknown) => void;
  setDocumentWindowOpen: (isOpen: boolean) => void;
};

export type UseDocumentAppControllerOptions = {
  createMenuHandlers: (controller: DocumentAppController) => NativeMenuActionHandlers;
  launchArguments?: string[];
  menus: NativeMenuConfig[];
  onInitialOpen: (launchArguments: string[] | undefined, controller: DocumentAppController) => Promise<void> | void;
  onRecentDocumentOpen?: (path: string, controller: DocumentAppController) => Promise<void> | void;
  ownerId: string;
  reportError: (error: unknown) => void;
  windowIdentifier?: string;
};

export type OpenSelectedDocumentPathOptions = {
  allowedFileTypes: readonly string[];
  invalidSelectionMessage?: string;
  isDocumentPath: (path: string) => boolean;
};

export async function openSelectedDocumentPath({
  allowedFileTypes,
  invalidSelectionMessage,
  isDocumentPath,
}: OpenSelectedDocumentPathOptions) {
  const paths = await openFileDialog({
    allowedFileTypes: [...allowedFileTypes],
    canChooseFiles: true,
  });
  const path = paths?.find(isDocumentPath) ?? null;

  if (path) {
    return path;
  }

  if (paths && paths.length > 0) {
    throw new Error(
      invalidSelectionMessage ?? `Choose a supported file (${allowedFileTypes.map((type) => `.${type}`).join(", ")}).`,
    );
  }

  return null;
}

export function useDocumentAppController({
  createMenuHandlers,
  launchArguments,
  menus,
  onInitialOpen,
  onRecentDocumentOpen,
  ownerId,
  reportError,
  windowIdentifier,
}: UseDocumentAppControllerOptions) {
  const didOpenDocumentWindowRef = useRef(false);
  const [isDocumentWindowOpen, setDocumentWindowOpen] = useState(false);
  const controller = useMemo<DocumentAppController>(() => ({
    isDocumentWindowOpen: () => isDocumentWindowOpen,
    reportError,
    setDocumentWindowOpen,
  }), [isDocumentWindowOpen, reportError]);
  const menuHandlers = useMemo(() => createMenuHandlers(controller), [controller, createMenuHandlers]);

  useNativeMenu({
    handlers: menuHandlers,
    menus,
    ownerId,
  });

  useEffect(() => {
    if (onRecentDocumentOpen) {
      const subscription = addRecentDocumentOpenListener(({ path }) => {
        Promise.resolve(onRecentDocumentOpen(path, controller)).catch(reportError);
      });

      return () => {
        subscription.remove();
      };
    }

    return undefined;
  }, [controller, onRecentDocumentOpen, reportError]);

  useEffect(() => {
    if (windowIdentifier) {
      const subscription = addWindowClosedListener((event) => {
        if (event.identifier === windowIdentifier) {
          controller.setDocumentWindowOpen(false);
        }
      });

      return () => {
        subscription.remove();
      };
    }

    return undefined;
  }, [controller, windowIdentifier]);

  useEffect(() => {
    if (!didOpenDocumentWindowRef.current) {
      didOpenDocumentWindowRef.current = true;
      Promise.resolve(onInitialOpen(launchArguments, controller)).catch(reportError);
    }
  }, [controller, launchArguments, onInitialOpen, reportError]);

  return controller;
}
