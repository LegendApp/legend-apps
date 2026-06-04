import { useCallback, useEffect } from "react";
import {
  setMarkdownEditorWindowOptions,
  openMarkdownSettingsWindow,
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

export function useMarkdownEditorWindowOptions({
  backgroundColor,
  filename,
  isDirty,
  isUntitledDocument,
  onError,
}: {
  backgroundColor: string;
  filename: string | null;
  isDirty: boolean;
  isUntitledDocument: boolean;
  onError: (error: unknown) => void;
}) {
  useEffect(() => {
    if (!filename) {
      return;
    }

    setMarkdownEditorWindowOptions({
      backgroundColor,
      filename,
      isDirty,
      isUntitledDocument,
    }).catch(onError);
  }, [backgroundColor, filename, isDirty, isUntitledDocument, onError]);
}
