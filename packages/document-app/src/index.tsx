import { openFileDialog } from "@legend-desktop/file-dialog";
import { watchFiles } from "@legend-desktop/file-system-watcher";
import { useNativeMenu, type NativeMenuActionHandlers, type NativeMenuConfig } from "@legend-desktop/native-menu";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { addApplicationReopenRequestedListener, addWindowClosedListener } from "@legend-desktop/window-manager";
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
  onReopenRequested?: (controller: DocumentAppController) => Promise<void> | void;
  ownerId: string;
  reportError: (error: unknown) => void;
  windowIdentifier?: string;
};

export type OpenSelectedDocumentPathOptions = {
  allowedFileTypes: readonly string[];
  invalidSelectionMessage?: string;
  isDocumentPath: (path: string) => boolean;
};

export type GetLaunchDocumentPathOptions = {
  isDocumentPath: (path: string) => boolean;
  launchArguments?: string[];
};

export type UseWatchedDocumentReloadOptions = {
  delayMs?: number;
  enabled?: boolean;
  onReload: () => void;
  path: string | null | undefined;
  shouldReload?: () => boolean;
};

export function getPathExtension(path: string) {
  return path.split(".").pop()?.toLowerCase();
}

export function pathMatchesExtensions(path: string, extensions: readonly string[]) {
  const extension = getPathExtension(path);
  return extension !== undefined && extensions.includes(extension);
}

export function getLaunchDocumentPath({
  isDocumentPath,
  launchArguments,
}: GetLaunchDocumentPathOptions) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  return launchArguments?.find(isDocumentPath) ?? argv.find(isDocumentPath) ?? null;
}

export function getDirectory(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : undefined;
}

export function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

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

export function useWatchedDocumentReload({
  delayMs = 100,
  enabled = true,
  onReload,
  path,
  shouldReload,
}: UseWatchedDocumentReloadOptions) {
  useEffect(() => {
    if (enabled && path) {
      let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
      const subscription = watchFiles([path], () => {
        if (!shouldReload || shouldReload()) {
          if (reloadTimeout) {
            clearTimeout(reloadTimeout);
          }
          reloadTimeout = setTimeout(() => {
            if (!shouldReload || shouldReload()) {
              onReload();
            }
          }, delayMs);
        }
      });

      return () => {
        if (reloadTimeout) {
          clearTimeout(reloadTimeout);
        }
        subscription.remove();
      };
    }

    return undefined;
  }, [delayMs, enabled, onReload, path, shouldReload]);
}

export function useDocumentAppController({
  createMenuHandlers,
  launchArguments,
  menus,
  onInitialOpen,
  onRecentDocumentOpen,
  onReopenRequested,
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
    if (onReopenRequested) {
      const subscription = addApplicationReopenRequestedListener((event) => {
        if (!event.hasVisibleWindows) {
          Promise.resolve(onReopenRequested(controller)).catch(reportError);
        }
      });

      return () => {
        subscription.remove();
      };
    }

    return undefined;
  }, [controller, onReopenRequested, reportError]);

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
