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
  appearance,
  backgroundColor,
  filename,
  isDirty,
  isUntitledDocument,
  onError,
}: {
  appearance: "dark" | "light";
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
      appearance,
      backgroundColor,
      filename,
      isDirty,
      isUntitledDocument,
    }).catch(onError);
  }, [appearance, backgroundColor, filename, isDirty, isUntitledDocument, onError]);
}
