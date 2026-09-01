import { openFileDialog } from "@legend-apps/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import { addRecentDocumentOpenListener } from "@legend-apps/recent-documents";
import {
  addDisplaysChangedListener,
  closeWindow,
  getDisplays,
  setWindowTitle,
  type Display,
  WindowStyleMask,
} from "@legend-apps/window-manager";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { getLastDeckPath, loadDeck } from "./deckLoader";
import { nextSlide, previousSlide, setCurrentSlide, setSlidesState, useSlidesState } from "./slidesStore";
import { slidesWindows } from "./slidesWindows";

type PresenterWindowProps = { launchArguments?: string[] };

const nextKeyCodes = new Set<number>([KeyCodes.KEY_RIGHT, KeyCodes.KEY_DOWN, KeyCodes.KEY_PAGE_DOWN, KeyCodes.KEY_SPACE]);
const previousKeyCodes = new Set<number>([KeyCodes.KEY_LEFT, KeyCodes.KEY_UP, KeyCodes.KEY_PAGE_UP]);

function Button({ disabled, label, onPress, primary = false }: { disabled?: boolean; label: string; onPress(): void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary && styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function Preview({ index, label }: { index: number; label: string }) {
  return (
    <View style={styles.previewSection}>
      <Text style={styles.eyebrow}>{label}</Text>
      <View style={styles.preview}>
        <SlideCanvas><DeckRenderer isPreview targetIndex={index} /></SlideCanvas>
      </View>
    </View>
  );
}

function launchDeckPath(launchArguments?: string[]) {
  return launchArguments?.find((argument) => argument.toLowerCase().endsWith(".mdx"));
}

export function PresenterWindow({ launchArguments }: PresenterWindowProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const state = useSlidesState((value) => value);

  const refreshDisplays = useCallback(async () => {
    const nextDisplays = await getDisplays();
    setDisplays(nextDisplays);
    setSelectedDisplayId((current) => nextDisplays.some((display) => display.id === current) ? current : null);
  }, []);

  const openDeck = useCallback(async () => {
    const paths = await openFileDialog({
      allowedFileTypes: ["mdx"],
      allowsMultipleSelection: false,
      canChooseFiles: true,
      message: "Choose an MDX presentation",
      prompt: "Open Deck",
    });
    if (paths?.[0]) {
      await loadDeck(paths[0]);
    }
  }, []);

  const openAudience = useCallback(async (display?: Display) => {
    const frame = display?.frame;
    const rehearsalFrame = displays.find((candidate) => candidate.isMain)?.visibleFrame;
    const rehearsalWidth = Math.min(1280, rehearsalFrame?.width ?? 1280);
    const rehearsalHeight = Math.min(720, rehearsalFrame?.height ?? 720);
    await slidesWindows.open("SlidesAudienceWindow", display ? {
      x: frame?.x,
      y: frame?.y,
      windowStyle: {
        height: frame?.height,
        mask: [WindowStyleMask.Borderless],
        width: frame?.width,
      },
    } : rehearsalFrame ? {
      x: rehearsalFrame.x + (rehearsalFrame.width - rehearsalWidth) / 2,
      y: rehearsalFrame.y + (rehearsalFrame.height - rehearsalHeight) / 2,
      windowStyle: { height: rehearsalHeight, width: rehearsalWidth },
    } : undefined);
    setSlidesState({ audienceOpen: true });
  }, [displays]);

  useEffect(() => {
    void refreshDisplays();
    const displaysSubscription = addDisplaysChangedListener(setDisplays);
    const recentSubscription = addRecentDocumentOpenListener(({ path }) => void loadDeck(path));
    const removeKeys = addKeyDownListener((event) => {
      if (nextKeyCodes.has(event.keyCode)) {
        nextSlide();
        return true;
      }
      if (previousKeyCodes.has(event.keyCode)) {
        previousSlide();
        return true;
      }
      return false;
    });
    const launchedPath = launchDeckPath(launchArguments);
    const initialPath = launchedPath ?? getLastDeckPath();
    if (initialPath) {
      void loadDeck(initialPath, Boolean(launchedPath));
    }
    return () => {
      displaysSubscription.remove();
      recentSubscription.remove();
      removeKeys();
    };
  }, [launchArguments, refreshDisplays]);

  const selectedDisplay = displays.find((display) => display.id === selectedDisplayId);
  const currentNotes = state.slides[state.currentSlide]?.notes;
  const showNext = state.config.presenter?.showNext !== false;
  const showNotes = state.config.presenter?.showNotes !== false;

  useEffect(() => {
    void setWindowTitle("slides-presenter", state.config.title ? `${state.config.title} — Legend Slides` : "Legend Slides");
  }, [state.config.title]);
  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarGroup}>
          <Button label="Open Deck…" onPress={() => void openDeck()} />
          <Text numberOfLines={1} style={styles.path}>{state.deckPath ?? "No deck open"}</Text>
        </View>
        <View style={styles.toolbarGroup}>
          <Button disabled={state.audienceOpen || !state.component} label={state.audienceOpen ? "Audience Open" : "Rehearse"} onPress={() => void openAudience()} />
          <Button disabled={!selectedDisplay || !state.component} label="Present" onPress={() => selectedDisplay && void openAudience(selectedDisplay)} primary />
          {state.audienceOpen && <Button label="Stop" onPress={() => void closeWindow("slides-audience").then(() => setSlidesState({ audienceOpen: false }))} />}
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.mainColumn}>
          {state.component ? (
            <>
              <View style={styles.previews}>
                <Preview index={state.currentSlide} label="Current" />
                {showNext && <Preview index={Math.min(state.currentSlide + 1, state.slides.length - 1)} label="Next" />}
              </View>
              <View style={styles.navigation}>
                <Button disabled={state.currentSlide === 0} label="Previous" onPress={previousSlide} />
                <Text style={styles.counter}>{state.currentSlide + 1} / {state.slides.length || 1}</Text>
                <Button disabled={state.currentSlide >= state.slides.length - 1} label="Next" onPress={nextSlide} primary />
              </View>
            </>
          ) : (
            <View style={styles.empty}>
              {state.status === "building" ? <ActivityIndicator /> : <Text style={styles.emptyTitle}>Open an MDX deck to begin</Text>}
              <Text style={styles.emptyBody}>Markdown, React Native components, and local TSX imports are supported.</Text>
              <Button label="Open Deck…" onPress={() => void openDeck()} primary />
            </View>
          )}
        </View>

        <View style={styles.sidebar}>
          <Text style={styles.sidebarTitle}>Presentation Display</Text>
          {displays.map((display) => (
            <Pressable key={display.id} onPress={() => setSelectedDisplayId(display.id)} style={[styles.displayRow, selectedDisplayId === display.id && styles.displayRowSelected]}>
              <Text style={styles.displayName}>{display.name}</Text>
              <Text style={styles.displayMeta}>{display.frame.width} × {display.frame.height}{display.isMain ? " · Main" : ""}</Text>
            </Pressable>
          ))}
          {showNotes && (
            <>
              <Text style={styles.sidebarTitle}>Speaker Notes</Text>
              <ScrollView style={styles.notes}><Text style={styles.notesText}>{currentNotes || "No notes for this slide."}</Text></ScrollView>
            </>
          )}
          {(state.buildErrors.length > 0 || state.buildWarnings.length > 0) && (
            <View style={styles.errors}>
              <Text style={styles.errorTitle}>Build output</Text>
              {[...state.buildErrors, ...state.buildWarnings].map((message, index) => <Text key={`${index}:${message}`} style={styles.errorText}>{message}</Text>)}
              {state.component && <Text style={styles.lastGood}>Showing the last successful build.</Text>}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: "#30323a", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  content: { flex: 1, flexDirection: "row" },
  counter: { color: "#d4d4d8", fontSize: 14, fontVariant: ["tabular-nums"] },
  disabled: { opacity: 0.4 },
  displayMeta: { color: "#a1a1aa", fontSize: 11, marginTop: 3 },
  displayName: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  displayRow: { borderColor: "#3f3f46", borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 },
  displayRowSelected: { backgroundColor: "#272c3b", borderColor: "#60a5fa" },
  empty: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center" },
  emptyBody: { color: "#a1a1aa", fontSize: 14 },
  emptyTitle: { color: "#fafafa", fontSize: 24, fontWeight: "700" },
  errors: { backgroundColor: "#321f24", borderRadius: 8, marginTop: 18, maxHeight: 220, padding: 12 },
  errorText: { color: "#fda4af", fontFamily: "Menlo", fontSize: 11, marginTop: 6 },
  errorTitle: { color: "#fecdd3", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  lastGood: { color: "#fda4af", fontSize: 11, fontStyle: "italic", marginTop: 10 },
  mainColumn: { flex: 1, padding: 20 },
  navigation: { alignItems: "center", flexDirection: "row", gap: 14, justifyContent: "center", marginTop: 18 },
  notes: { backgroundColor: "#18181b", borderRadius: 8, maxHeight: 240, padding: 12 },
  notesText: { color: "#d4d4d8", fontSize: 14, lineHeight: 20 },
  path: { color: "#a1a1aa", flexShrink: 1, fontSize: 12, maxWidth: 430 },
  pressed: { opacity: 0.75 },
  preview: { aspectRatio: 16 / 9, backgroundColor: "#000", borderColor: "#3f3f46", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  previews: { flex: 1, flexDirection: "row", gap: 18 },
  previewSection: { flex: 1 },
  primaryButton: { backgroundColor: "#2563eb" },
  primaryButtonText: { color: "#fff" },
  root: { backgroundColor: "#18181b", flex: 1 },
  sidebar: { backgroundColor: "#202024", borderLeftColor: "#3f3f46", borderLeftWidth: StyleSheet.hairlineWidth, padding: 16, width: 290 },
  sidebarTitle: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10, marginTop: 8, textTransform: "uppercase" },
  toolbar: { alignItems: "center", borderBottomColor: "#3f3f46", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: 16 },
  toolbarGroup: { alignItems: "center", flexDirection: "row", gap: 10 },
});
