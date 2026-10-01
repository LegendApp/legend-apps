import { addAppListener } from "@legendapp/spark/app";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { writeText } from "@legendapp/spark/files";
import { subscribeToOpenRequests } from "@legendapp/spark/app/documents";
import { openRequestedDocument } from "./documentOpen";
import { saveFileDialog } from "@legendapp/spark/dialogs";
import { prepareNotesExit } from "./notesRecovery";
import { speakerNotesDrafts } from "./speakerNotesDrafts";
import { Alert } from "react-native";
import { installSlidesExitHandler, registerSlidesExitPreparation } from "./slidesExit";
import { useEffect, useRef } from "react";
import { openSlidesPresenterWindow } from "./slidesWindows";
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
          const path = await saveFileDialog({ defaultName: "Speaker Notes Recovery.md", filters: [{ extensions: ["md"] }] });
          if (path.canceled) return false;
          await writeText(path.path, contents);
          return true;
        });
      } catch (error) {
        Alert.alert("Could not preserve speaker notes", String(error));
        return false;
      }
    });
    const exitSubscription = installSlidesExitHandler();
    const openPresenter = openSlidesPresenterWindow;
    const reportOpenError = (error: unknown) => Alert.alert("Could not open presenter", String(error));
    void openPresenter().catch(reportOpenError);
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
    const documents = ownRegistration(subscribeToOpenRequests(event => {
      if (event.type !== "file") return;
      const { path } = event;
      void openRequestedDocument(path, openPresenter, loadDeck, () => Alert.alert("Finish editing first", "Turn off source editing with the toolbar button before opening another deck. Changes save automatically.")).catch(reportOpenError);
    }));
    const subscription = ownRegistration(addAppListener("reopen", () => void openPresenter().catch(reportOpenError)));
    return () => { void documents.remove().catch(console.error); void subscription.remove().catch(console.error); void exitSubscription.remove().catch(console.error); unregisterNotes(); };
  }, [launchedPath]);
  return null;
}

export default App;
