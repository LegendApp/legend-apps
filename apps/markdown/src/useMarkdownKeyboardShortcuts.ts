import { addKeyDownListener, KeyCodes } from "@legend-desktop/keyboard-manager";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { useEffect, type RefObject } from "react";

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef }: MarkdownKeyboardShortcutsOptions) {
  useEffect(() => {
    return addKeyDownListener((event) => {
      if (event.keyCode === KeyCodes.KEY_ESCAPE) {
        return documentCommandsRef.current?.commitAndBlurActiveBlock() === true;
      }

      return false;
    });
  }, [documentCommandsRef]);
}
