import { useEffect, useRef } from "react";
import { applyMarkdownThemeSetting } from "./markdownSettings";
import { loadMarkdownUserThemesSync } from "./userThemes";
import {
  openMarkdownEditorWindow,
  registerMarkdownWindows,
} from "./markdownWindows";

loadMarkdownUserThemesSync();
registerMarkdownWindows();

type MarkdownAppProps = {
  launchArguments?: string[];
};

export function App({ launchArguments }: MarkdownAppProps) {
  const didOpenEditorRef = useRef(false);

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  useEffect(() => {
    if (!didOpenEditorRef.current) {
      didOpenEditorRef.current = true;
      applyMarkdownThemeSetting();
      console.info("[MarkdownAppController] mounted in hidden host; opening editor window.");
      openMarkdownEditorWindow(launchArguments).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MarkdownAppController] Unable to open editor window: ${message}`);
      });
    }
  }, [launchArguments]);

  return null;
}

export default App;
