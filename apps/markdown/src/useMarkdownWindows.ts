import { useObserveEffect } from "@legendapp/state/react";
import { useCallback } from "react";
import {
  setMarkdownEditorWindowOptions,
  openMarkdownSettingsWindow,
} from "./markdownWindows";
import type { MarkdownDocumentSessionState$ } from "./useMarkdownDocumentSession";

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
  onError,
  sessionState$,
  windowId,
}: {
  appearance: "dark" | "light";
  backgroundColor: string;
  onError: (error: unknown) => void;
  sessionState$: MarkdownDocumentSessionState$;
  windowId: string;
}) {
  useObserveEffect(() => {
    const state = sessionState$.get();
    if (!state.filename) {
      return;
    }

    setMarkdownEditorWindowOptions({
      appearance,
      backgroundColor,
      filename: state.filename,
      isDirty: state.isDirty,
      isUntitledDocument: state.documentSource === "untitled",
      saveState: state.saveState,
      windowId,
    }).catch(onError);
  }, [appearance, backgroundColor, onError, sessionState$, windowId]);
}
