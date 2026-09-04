import { openFileDialog } from "@legend-apps/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import { addRecentDocumentOpenListener } from "@legend-apps/recent-documents";
import {
  addDisplaysChangedListener,
  addWindowClosedListener,
  closeWindow,
  getDisplays,
  setPreventDisplaySleep,
  setWindowTitle,
  showWindow,
  type Display,
  WindowStyleMask,
} from "@legend-apps/window-manager";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { applyPendingDeck, getLastDeckPath, loadDeck } from "./deckLoader";
import { getPresentationDisplayId, rememberPresentationDisplayId } from "./slidesPreferences";
import { nextSlide, previousSlide, retrySlideContent, setCurrentSlide, setSlidesState, useSlidesState } from "./slidesStore";
import { slidesWindows } from "./slidesWindows";
import { createAudienceSession } from "./audienceSession";

type PresenterWindowProps = { launchArguments?: string[] };

const nextKeyCodes = new Set<number>([KeyCodes.KEY_RIGHT, KeyCodes.KEY_DOWN, KeyCodes.KEY_PAGE_DOWN, KeyCodes.KEY_SPACE]);
const previousKeyCodes = new Set<number>([KeyCodes.KEY_LEFT, KeyCodes.KEY_UP, KeyCodes.KEY_PAGE_UP]);
const digitKeyCodes = new Map<number, string>([
  [KeyCodes.KEY_0, "0"],
  [KeyCodes.KEY_1, "1"],
  [KeyCodes.KEY_2, "2"],
  [KeyCodes.KEY_3, "3"],
  [KeyCodes.KEY_4, "4"],
  [KeyCodes.KEY_5, "5"],
  [KeyCodes.KEY_6, "6"],
  [KeyCodes.KEY_7, "7"],
  [KeyCodes.KEY_8, "8"],
  [KeyCodes.KEY_9, "9"],
]);

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

function SpeakerNotes({ notes, slideCount, slideIndex }: { notes?: string; slideCount: number; slideIndex: number }) {
  return (
    <View style={styles.notesSection}>
      <View style={styles.notesHeader}>
        <Text style={styles.notesTitle}>Speaker Notes</Text>
        <Text style={styles.notesSlide}>Slide {slideIndex + 1} of {slideCount || 1}</Text>
      </View>
      <ScrollView key={slideIndex} contentContainerStyle={styles.notesContent} style={styles.notes}>
        <Text style={[styles.notesText, !notes && styles.notesPlaceholder]}>{notes || "No notes for this slide."}</Text>
      </ScrollView>
    </View>
  );
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function PresenterClock({ audienceOpen }: { audienceOpen: boolean }) {
  const elapsedBeforeRun = useRef(0);
  const startedAt = useRef(0);
  const runningRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [running, setRunning] = useState(false);

  const changeRunning = useCallback((nextRunning: boolean) => {
    if (nextRunning === runningRef.current) {
      return;
    }
    if (nextRunning) {
      startedAt.current = Date.now();
    } else {
      elapsedBeforeRun.current += Date.now() - startedAt.current;
      setElapsed(elapsedBeforeRun.current);
    }
    runningRef.current = nextRunning;
    setRunning(nextRunning);
  }, []);

  useEffect(() => {
    changeRunning(audienceOpen);
  }, [audienceOpen, changeRunning]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
      if (runningRef.current) {
        setElapsed(elapsedBeforeRun.current + Date.now() - startedAt.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const reset = () => {
    elapsedBeforeRun.current = 0;
    startedAt.current = Date.now();
    setElapsed(0);
  };

  return (
    <View style={styles.clockSection}>
      <View>
        <Text style={styles.clockLabel}>Elapsed</Text>
        <Text style={styles.elapsed}>{formatElapsed(elapsed)}</Text>
      </View>
      <View style={styles.clockRight}>
        <Text style={styles.clockLabel}>Current time</Text>
        <Text style={styles.currentTime}>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
      </View>
      <View style={styles.timerActions}>
        <Button label={running ? "Pause" : "Start"} onPress={() => changeRunning(!running)} />
        <Button label="Reset" onPress={reset} />
      </View>
    </View>
  );
}

function SlideJump({ onFocusChange, slideCount }: { onFocusChange(focused: boolean): void; slideCount: number }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const slideNumber = Number(value);
    if (Number.isInteger(slideNumber) && slideNumber >= 1 && slideNumber <= slideCount) {
      setCurrentSlide(slideNumber - 1);
      setValue("");
    }
  };
  return (
    <View style={styles.jumpRow}>
      <TextInput
        accessibilityLabel="Slide number"
        keyboardType="number-pad"
        onBlur={() => onFocusChange(false)}
        onChangeText={(text) => setValue(text.replace(/\D/g, ""))}
        onFocus={() => onFocusChange(true)}
        onSubmitEditing={submit}
        placeholder={`1–${Math.max(1, slideCount)}`}
        placeholderTextColor="#71717a"
        returnKeyType="go"
        style={styles.jumpInput}
        value={value}
      />
      <Button disabled={!value} label="Go" onPress={submit} />
    </View>
  );
}

function launchDeckPath(launchArguments?: string[]) {
  return launchArguments?.find((argument) => argument.toLowerCase().endsWith(".mdx"));
}

export function PresenterWindow({ launchArguments }: PresenterWindowProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const [keyboardJump, setKeyboardJump] = useState("");
  const jumpInputFocused = useRef(false);
  const keyboardJumpRef = useRef("");
  const keyboardJumpTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const state = useSlidesState((value) => value);
  const [audience] = useState(() => createAudienceSession({
    async open(display) {
      const frame = display?.frame;
      const rehearsalFrame = !display ? (await getDisplays()).find((candidate) => candidate.isMain)?.visibleFrame : undefined;
      const width = Math.min(1280, rehearsalFrame?.width ?? 1280);
      const height = Math.min(720, rehearsalFrame?.height ?? 720);
      await slidesWindows.open("SlidesAudienceWindow", display ? {
        x: frame?.x, y: frame?.y,
        windowStyle: { height: frame?.height, width: frame?.width, mask: [WindowStyleMask.Borderless] },
      } : {
        x: rehearsalFrame ? rehearsalFrame.x + (rehearsalFrame.width - width) / 2 : undefined,
        y: rehearsalFrame ? rehearsalFrame.y + (rehearsalFrame.height - height) / 2 : undefined,
        windowStyle: { height, width },
      });
    },
    async close() {
      const result = await closeWindow("slides-audience");
      if (!result.success) throw new Error(result.message ?? "Could not close the audience window.");
    },
    async focusPresenter() { await showWindow("slides-presenter"); },
    update: setSlidesState,
  }));

  const refreshDisplays = useCallback(async () => {
    const nextDisplays = await getDisplays();
    setDisplays(nextDisplays);
    await audience.displaysChanged(nextDisplays);
    setSelectedDisplayId((current) => {
      if (nextDisplays.some((display) => display.id === current)) {
        return current;
      }
      const remembered = getPresentationDisplayId();
      return nextDisplays.some((display) => display.id === remembered) ? remembered ?? null : null;
    });
  }, [audience]);

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

  const openAudience = audience.open;
  const closeAudience = audience.close;

  useEffect(() => {
    void refreshDisplays();
    const displaysSubscription = addDisplaysChangedListener(() => void refreshDisplays());
    const recentSubscription = addRecentDocumentOpenListener(({ path }) => void loadDeck(path));
    const closedSubscription = addWindowClosedListener((event) => {
      if (event.identifier === "slides-audience") {
        audience.closed();
      }
    });
    const launchedPath = launchDeckPath(launchArguments);
    const initialPath = launchedPath ?? getLastDeckPath();
    if (initialPath) {
      void loadDeck(initialPath, Boolean(launchedPath));
    }
    return () => {
      displaysSubscription.remove();
      recentSubscription.remove();
      closedSubscription.remove();
    };
  }, [audience, launchArguments, refreshDisplays]);

  useEffect(() => {
    const removeKeys = addKeyDownListener((event) => {
      if (jumpInputFocused.current) {
        return false;
      }
      if (nextKeyCodes.has(event.keyCode)) {
        nextSlide();
        return true;
      }
      if (previousKeyCodes.has(event.keyCode)) {
        previousSlide();
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_HOME) {
        setCurrentSlide(0);
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_END) {
        setCurrentSlide(Number.MAX_SAFE_INTEGER);
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_B) {
        setSlidesState((current) => ({ blackout: !current.blackout }));
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_ESCAPE && state.audienceOpen) {
        void closeAudience();
        return true;
      }
      const digit = digitKeyCodes.get(event.keyCode);
      if (digit !== undefined) {
        const nextJump = `${keyboardJumpRef.current}${digit}`.replace(/^0+/, "").slice(0, 4);
        keyboardJumpRef.current = nextJump;
        setKeyboardJump(nextJump);
        if (keyboardJumpTimeout.current) {
          clearTimeout(keyboardJumpTimeout.current);
        }
        keyboardJumpTimeout.current = setTimeout(() => {
          keyboardJumpRef.current = "";
          setKeyboardJump("");
        }, 2500);
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_RETURN && keyboardJumpRef.current) {
        setCurrentSlide(Number(keyboardJumpRef.current) - 1);
        keyboardJumpRef.current = "";
        setKeyboardJump("");
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_DELETE && keyboardJumpRef.current) {
        const nextJump = keyboardJumpRef.current.slice(0, -1);
        keyboardJumpRef.current = nextJump;
        setKeyboardJump(nextJump);
        return true;
      }
      return false;
    });
    return () => {
      removeKeys();
      if (keyboardJumpTimeout.current) {
        clearTimeout(keyboardJumpTimeout.current);
      }
    };
  }, [closeAudience, state.audienceOpen]);

  useEffect(() => {
    void setPreventDisplaySleep(state.audienceOpen);
    return () => {
      if (state.audienceOpen) {
        void setPreventDisplaySleep(false);
      }
    };
  }, [state.audienceOpen]);

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
          {keyboardJump && <Text style={styles.keyboardJump}>Jump to {keyboardJump} ↵</Text>}
          <Button disabled={state.audienceOpen || !state.component} label={state.audienceOpen ? "Audience Open" : "Rehearse"} onPress={() => void openAudience()} />
          <Button disabled={!selectedDisplay || !state.component} label="Present" onPress={() => selectedDisplay && void openAudience(selectedDisplay)} primary />
          {state.audienceOpen && <Button label="Stop" onPress={() => void closeAudience()} />}
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
              {showNotes && (
                <SpeakerNotes notes={currentNotes} slideCount={state.slides.length} slideIndex={state.currentSlide} />
              )}
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

        <ScrollView style={styles.sidebar} contentContainerStyle={{ padding: 16 }}>
          <PresenterClock audienceOpen={state.audienceOpen} />
          <Text style={styles.sidebarTitle}>Deck Updates</Text>
          <Button
            label={state.deckLocked ? "Unlock Live Updates" : "Lock Deck"}
            onPress={() => setSlidesState({ deckLocked: !state.deckLocked })}
          />
          <Text style={styles.displayMeta}>{state.deckLocked ? "Deck locked. Saves will not change the stage." : "Live updates enabled."}</Text>
          {state.status === "building" && <Text style={styles.displayMeta}>Compiling changes…</Text>}
          {state.pendingDeck && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text style={styles.displayMeta}>Update ready: {state.pendingDeck.path.split("/").pop()}</Text>
              <Button label="Apply Update Now" onPress={applyPendingDeck} />
            </View>
          )}
          <Text style={styles.sidebarTitle}>Slide Navigator</Text>
          <SlideJump onFocusChange={(focused) => { jumpInputFocused.current = focused; }} slideCount={state.slides.length} />
          <Button
            disabled={!state.audienceOpen}
            label={state.blackout ? "Restore Audience" : "Blackout Audience"}
            onPress={() => setSlidesState((current) => ({ blackout: !current.blackout }))}
          />
          <Text style={styles.sidebarTitle}>Presentation Display</Text>
          {!!state.displayMessage && <Text style={styles.errorText}>{state.displayMessage}</Text>}
          {displays.map((display) => (
            <Pressable key={display.id} onPress={() => {
              setSelectedDisplayId(display.id);
              rememberPresentationDisplayId(display.id);
            }} style={[styles.displayRow, selectedDisplayId === display.id && styles.displayRowSelected]}>
              <Text style={styles.displayName}>{display.name}</Text>
              <Text style={styles.displayMeta}>{display.frame.width} × {display.frame.height}{display.isMain ? " · Main" : ""}</Text>
            </Pressable>
          ))}
          {(state.buildErrors.length > 0 || state.buildWarnings.length > 0) && (
            <View style={styles.errors}>
              <Text style={styles.errorTitle}>Build output</Text>
              {[...state.buildErrors, ...state.buildWarnings].map((message, index) => <Text key={`${index}:${message}`} style={styles.errorText}>{message}</Text>)}
              {state.component && <Text style={styles.lastGood}>Showing the last successful build.</Text>}
            </View>
          )}
          {state.runtimeErrors.length > 0 && (
            <View className="mt-4 gap-2">
              <Text style={styles.errorTitle}>Slide errors</Text>
              {state.runtimeErrors.map((message) => <Text key={message} selectable style={styles.errorText}>{message}</Text>)}
              <Button label="Retry Slide Content" onPress={retrySlideContent} />
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { backgroundColor: "#30323a", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  clockLabel: { color: "#71717a", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  clockRight: { alignItems: "flex-end" },
  clockSection: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 4, rowGap: 12 },
  content: { flex: 1, flexDirection: "row" },
  counter: { color: "#d4d4d8", fontSize: 14, fontVariant: ["tabular-nums"] },
  currentTime: { color: "#d4d4d8", fontSize: 17, fontVariant: ["tabular-nums"], fontWeight: "600", marginTop: 3 },
  disabled: { opacity: 0.4 },
  displayMeta: { color: "#a1a1aa", fontSize: 11, marginTop: 3 },
  displayName: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  displayRow: { borderColor: "#3f3f46", borderRadius: 8, borderWidth: 1, marginBottom: 8, padding: 10 },
  displayRowSelected: { backgroundColor: "#272c3b", borderColor: "#60a5fa" },
  empty: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center" },
  emptyBody: { color: "#a1a1aa", fontSize: 14 },
  emptyTitle: { color: "#fafafa", fontSize: 24, fontWeight: "700" },
  elapsed: { color: "#fafafa", fontSize: 26, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 1 },
  errors: { backgroundColor: "#321f24", borderRadius: 8, marginTop: 18, maxHeight: 220, padding: 12 },
  errorText: { color: "#fda4af", fontFamily: "Menlo", fontSize: 11, marginTop: 6 },
  errorTitle: { color: "#fecdd3", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  lastGood: { color: "#fda4af", fontSize: 11, fontStyle: "italic", marginTop: 10 },
  jumpInput: { backgroundColor: "#18181b", borderColor: "#3f3f46", borderRadius: 8, borderWidth: 1, color: "#f4f4f5", flex: 1, fontSize: 14, minHeight: 37, paddingHorizontal: 10 },
  jumpRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  keyboardJump: { color: "#93c5fd", fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "600" },
  mainColumn: { flex: 1, padding: 20 },
  navigation: { alignItems: "center", flexDirection: "row", gap: 14, justifyContent: "center", marginTop: 18 },
  notes: { maxHeight: 170 },
  notesContent: { paddingHorizontal: 16, paddingVertical: 14 },
  notesHeader: { alignItems: "center", borderBottomColor: "#3f3f46", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  notesPlaceholder: { color: "#71717a", fontStyle: "italic" },
  notesSection: { backgroundColor: "#202024", borderColor: "#3f3f46", borderRadius: 10, borderWidth: 1, marginTop: 18, minHeight: 112, overflow: "hidden" },
  notesSlide: { color: "#71717a", fontSize: 12, fontVariant: ["tabular-nums"] },
  notesText: { color: "#e4e4e7", fontSize: 17, lineHeight: 25 },
  notesTitle: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  path: { color: "#a1a1aa", flexShrink: 1, fontSize: 12, maxWidth: 430 },
  pressed: { opacity: 0.75 },
  preview: { aspectRatio: 16 / 9, backgroundColor: "#000", borderColor: "#3f3f46", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  previews: { flex: 1, flexDirection: "row", gap: 18 },
  previewSection: { flex: 1 },
  primaryButton: { backgroundColor: "#2563eb" },
  primaryButtonText: { color: "#fff" },
  root: { backgroundColor: "#18181b", flex: 1 },
  sidebar: { backgroundColor: "#202024", borderLeftColor: "#3f3f46", borderLeftWidth: StyleSheet.hairlineWidth, flexGrow: 0, width: 290 },
  sidebarTitle: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10, marginTop: 8, textTransform: "uppercase" },
  toolbar: { alignItems: "center", borderBottomColor: "#3f3f46", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: 16 },
  toolbarGroup: { alignItems: "center", flexDirection: "row", gap: 10 },
  timerActions: { flexBasis: "100%", flexDirection: "row", gap: 8 },
});
