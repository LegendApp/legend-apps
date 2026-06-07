import { addKeyDownListener, hasModifier, KeyCodes } from "@legend-desktop/keyboard-manager";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { useEffect, type RefObject } from "react";

type MarkdownKeyboardShortcutsOptions = {
  documentCommandsRef: RefObject<MarkdownDocumentCommands | null>;
};

export function useMarkdownKeyboardShortcuts({ documentCommandsRef }: MarkdownKeyboardShortcutsOptions) {
  useEffect(() => {
    return addKeyDownListener((event) => {
      const hasOptionOnly =
        hasModifier(event, KeyCodes.MODIFIER_OPTION) &&
        !hasModifier(event, KeyCodes.MODIFIER_COMMAND) &&
        !hasModifier(event, KeyCodes.MODIFIER_CONTROL) &&
        !hasModifier(event, KeyCodes.MODIFIER_SHIFT);
      if (hasOptionOnly && event.keyCode === KeyCodes.KEY_UP) {
        documentCommandsRef.current?.moveActiveBlockUp();
        return true;
      }
      if (hasOptionOnly && event.keyCode === KeyCodes.KEY_DOWN) {
        documentCommandsRef.current?.moveActiveBlockDown();
        return true;
      }

      if (event.keyCode === KeyCodes.KEY_ESCAPE) {
        return documentCommandsRef.current?.commitAndBlurActiveBlock() === true;
      }

      return false;
    });
  }, [documentCommandsRef]);
}
