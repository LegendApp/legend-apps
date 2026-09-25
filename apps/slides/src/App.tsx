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
      if (await speakerNotesDrafts.flushAll()) return true;
      Alert.alert("Speaker notes not saved", "Your draft has been kept. Reopen the affected slide to review it and retry saving before quitting.");
      return false;
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
