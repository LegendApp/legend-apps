import { saveFileDialog, writeTextFile } from "@legend-apps/file-dialog";
import { prepareNotesExit } from "./notesRecovery";
import { speakerNotesDrafts } from "./speakerNotesDrafts";
import { Alert } from "react-native";
import { installSlidesExitHandler, registerSlidesExitPreparation } from "./slidesExit";
import { addApplicationReopenRequestedListener } from "@legend-apps/window-manager";
import { useEffect, useRef } from "react";
import { slidesWindows } from "./slidesWindows";
import { getLastDeckPath, loadDeck } from "./deckLoader";
import { getSlidesState } from "./slidesStore";

export type SlidesAppProps = { launchArguments?: string[] };

export function App({ launchArguments }: SlidesAppProps) {
  const launchedPath = launchArguments?.find((argument) => argument.toLowerCase().endsWith(".mdx"));
  const handledLaunch = useRef<string | null>(null);
  useEffect(() => {
    const unregisterNotes = registerSlidesExitPreparation(async () => {
      try {
        return await prepareNotesExit(speakerNotesDrafts, affected => new Promise(resolve => {
          Alert.alert("Speaker notes need recovery", `These notes could not be saved to their decks:\n\n${affected.join("\n")}\n\nYou can continue with drafts saved locally, or export a copy to recover them in another deck.`, [
            { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
            { text: "Keep Drafts and Continue", onPress: () => resolve("keep") },
            { text: "Export Drafts…", onPress: () => resolve("export") },
          ]);
        }), async contents => {
          const path = await saveFileDialog({ defaultName: "Speaker Notes Recovery.md", allowedFileTypes: ["md"] });
          if (!path) return false;
          await writeTextFile(path, contents);
          return true;
        });
      } catch (error) {
        Alert.alert("Could not preserve speaker notes", String(error));
        return false;
      }
    });
    const exitSubscription = installSlidesExitHandler();
    const openPresenter = () => slidesWindows.open("SlidesPresenterWindow");
    void openPresenter();
    // Deck opening is part of launch, not a reaction to presenter renders.
    // Deduplicate setup-cleanup-setup and leave Dock reopen focused on windows.
    const launchKey = launchedPath ?? "";
    if (handledLaunch.current !== launchKey) {
      handledLaunch.current = launchKey;
      const state = getSlidesState();
      const initialPath = launchedPath ?? (state.status === "idle" ? getLastDeckPath() : undefined);
      if (initialPath && (state.status === "idle" || state.deckPath !== initialPath)) {
        void loadDeck(initialPath, Boolean(launchedPath));
      }
    }
    const subscription = addApplicationReopenRequestedListener(() => void openPresenter());
    return () => { subscription.remove(); exitSubscription.remove(); unregisterNotes(); };
  }, [launchedPath]);
  return null;
}

export default App;
