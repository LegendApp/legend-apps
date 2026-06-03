import { useCallback, useEffect } from "react";
import {
  openMarkdownSettingsWindow,
  setMarkdownMainWindowOptions,
} from "./markdownWindows";

export function useMarkdownSettingsWindow({
  onError,
}: {
  backgroundColor: string;
  onError: (error: unknown) => void;
}) {
  return useCallback(() => {
    openMarkdownSettingsWindow().catch(onError);
  }, [onError]);
}

export function useMarkdownMainWindowOptions({
  backgroundColor,
  filename,
  isUntitledDocument,
  onError,
}: {
  backgroundColor: string;
  filename: string | null;
  isUntitledDocument: boolean;
  onError: (error: unknown) => void;
}) {
  useEffect(() => {
    if (!filename) {
      return;
    }

    setMarkdownMainWindowOptions({
      backgroundColor,
      filename,
      isUntitledDocument,
    }).catch(onError);
  }, [backgroundColor, filename, isUntitledDocument, onError]);
}
