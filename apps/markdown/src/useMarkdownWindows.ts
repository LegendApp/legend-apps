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
  filename,
  isDirty,
  isUntitledDocument,
  onError,
}: {
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
      filename,
      isDirty,
      isUntitledDocument,
    }).catch(onError);
  }, [filename, isDirty, isUntitledDocument, onError]);
}
