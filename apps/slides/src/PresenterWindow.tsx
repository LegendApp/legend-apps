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
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { applyPendingDeck, getLastDeckPath, loadDeck } from "./deckLoader";
import {
  getPresentationDisplayId,
  getPresenterLayout,
  rememberPresentationDisplayId,
  rememberPresenterLayout,
  resetPresenterLayout as resetStoredPresenterLayout,
} from "./slidesPreferences";
import { defaultPresenterLayout, resizePresenterLayout } from "./presenterLayout";
import { nextSlide, previousSlide, retrySlideContent, setCurrentSlide, setSlidesState, useSlidesState } from "./slidesStore";
import { slidesWindows } from "./slidesWindows";
import { createAudienceSession } from "./audienceSession";
import { useSlidesMenus } from "./slidesMenus";

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

function Preview({ index, label, weight = 1 }: { index: number; label: string; weight?: number }) {
  return (
    <View style={[styles.previewSection, { flex: weight }]}>
      <Text style={styles.eyebrow}>{label}</Text>
      <View style={styles.preview}>
        <SlideCanvas><DeckRenderer isPreview targetIndex={index} /></SlideCanvas>
      </View>
    </View>
  );
}

function SpeakerNotes({ notes, slideCount, slideIndex, weight }: { notes?: string; slideCount: number; slideIndex: number; weight: number }) {
  return (
    <View style={[styles.notesSection, { flex: weight }]}>
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

type ResizeHandleProps = {
  direction: "horizontal" | "vertical";
  label: string;
  onResize(delta: number): void;
  onResizeEnd(): void;
};

function ResizeHandle({ direction, label, onResize, onResizeEnd }: ResizeHandleProps) {
  const lastDeltaRef = useRef(0);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeRef.current = onResize;
  onResizeEndRef.current = onResizeEnd;
  const [panResponder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      lastDeltaRef.current = 0;
    },
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const totalDelta = direction === "horizontal" ? gesture.dx : gesture.dy;
      const delta = totalDelta - lastDeltaRef.current;
      lastDeltaRef.current = totalDelta;
      if (delta !== 0) onResizeRef.current(delta);
    },
    onPanResponderRelease: () => {
      lastDeltaRef.current = 0;
      onResizeEndRef.current();
    },
    onPanResponderTerminate: () => {
      lastDeltaRef.current = 0;
      onResizeEndRef.current();
    },
  }));

  return (
    <View
      accessibilityActions={[{ name: "decrement" }, { name: "increment" }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      onAccessibilityAction={(event) => {
        onResize(event.nativeEvent.actionName === "increment" ? 24 : -24);
        onResizeEnd();
      }}
      style={[
        styles.resizeHandle,
        direction === "horizontal" ? styles.horizontalResizeHandle : styles.verticalResizeHandle,
        // React Native macOS supports resize cursors that are missing from the core ViewStyle type.
        { cursor: direction === "horizontal" ? "ew-resize" : "ns-resize" } as any,
      ]}
      {...panResponder.panHandlers}
    >
      <View style={direction === "horizontal" ? styles.horizontalResizeLine : styles.verticalResizeLine} />
    </View>
  );
}

type PresenterWorkspaceProps = {
  currentIndex: number;
  nextIndex: number;
  notes?: string;
  resetVersion: number;
  showNext: boolean;
  showNotes: boolean;
  slideCount: number;
};

function PresenterWorkspace({
  currentIndex,
  nextIndex,
  notes,
  resetVersion,
  showNext,
  showNotes,
  slideCount,
}: PresenterWorkspaceProps) {
  const [layout, setLayout] = useState(getPresenterLayout);
  const layoutRef = useRef(layout);
  const workspaceSizeRef = useRef({ height: 0, width: 0 });

  useEffect(() => {
    if (resetVersion === 0) return;
    layoutRef.current = defaultPresenterLayout;
    setLayout(defaultPresenterLayout);
  }, [resetVersion]);

  const handleWorkspaceLayout = useCallback((event: LayoutChangeEvent) => {
    workspaceSizeRef.current = event.nativeEvent.layout;
  }, []);

  const resize = useCallback((divider: "previews" | "notes", delta: number) => {
    const availableSize = divider === "previews"
      ? workspaceSizeRef.current.width
      : workspaceSizeRef.current.height;
    const nextLayout = resizePresenterLayout(layoutRef.current, divider, delta, availableSize);
    if (nextLayout === layoutRef.current) return;
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
  }, []);

  const persistLayout = useCallback(() => rememberPresenterLayout(layoutRef.current), []);
  const previewWeight = showNotes ? 1 - layout.notesRatio : 1;

  return (
    <View onLayout={handleWorkspaceLayout} style={styles.workspace}>
      <View style={[styles.previews, { flex: previewWeight }]}>
        <Preview index={currentIndex} label="Current" weight={showNext ? layout.currentPreviewRatio : 1} />
        {showNext && (
          <>
            <ResizeHandle
              direction="horizontal"
              label="Resize current and next slide previews"
              onResize={(delta) => resize("previews", delta)}
              onResizeEnd={persistLayout}
            />
            <Preview index={nextIndex} label="Next" weight={1 - layout.currentPreviewRatio} />
          </>
        )}
      </View>
      {showNotes && (
        <>
          <ResizeHandle
            direction="vertical"
            label="Resize slide previews and speaker notes"
            onResize={(delta) => resize("notes", delta)}
            onResizeEnd={persistLayout}
          />
          <SpeakerNotes
            notes={notes}
            slideCount={slideCount}
            slideIndex={currentIndex}
            weight={layout.notesRatio}
          />
        </>
      )}
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

function PresenterClock({ audienceOpen, rehearsal }: { audienceOpen: boolean; rehearsal: boolean }) {
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
    if (audienceOpen) {
      elapsedBeforeRun.current = 0;
      startedAt.current = Date.now();
      setElapsed(0);
    }
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
      {rehearsal && (
        <View style={styles.timerActions}>
          <Button label={running ? "Pause" : "Start"} onPress={() => changeRunning(!running)} />
          <Button label="Reset" onPress={reset} />
        </View>
      )}
    </View>
  );
}

function launchDeckPath(launchArguments?: string[]) {
  return launchArguments?.find((argument) => argument.toLowerCase().endsWith(".mdx"));
}

export function PresenterWindow({ launchArguments }: PresenterWindowProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const [rehearsalEnabled, setRehearsalEnabled] = useState(false);
  const [activeMode, setActiveMode] = useState<"rehearsal" | "presentation" | null>(null);
  const [presenterLayoutResetVersion, setPresenterLayoutResetVersion] = useState(0);
  const [keyboardJump, setKeyboardJump] = useState("");
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
      if (nextDisplays.some((display) => display.id === remembered)) return remembered ?? null;
      return nextDisplays.find((display) => !display.isMain)?.id ?? nextDisplays[0]?.id ?? null;
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

  const resetPresenterLayout = useCallback(() => {
    resetStoredPresenterLayout();
    setPresenterLayoutResetVersion((version) => version + 1);
  }, []);

  useSlidesMenus(openDeck, state.audienceOpen, state.blackout, resetPresenterLayout);

  const openAudience = audience.open;
  const closeAudience = audience.close;

  useEffect(() => {
    void refreshDisplays();
    const displaysSubscription = addDisplaysChangedListener(() => void refreshDisplays());
    const recentSubscription = addRecentDocumentOpenListener(({ path }) => void loadDeck(path));
    const closedSubscription = addWindowClosedListener((event) => {
      if (event.identifier === "slides-audience") {
        audience.closed();
        setActiveMode(null);
        setSlidesState({ deckLocked: false });
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

  const startAudience = async () => {
    const mode = rehearsalEnabled ? "rehearsal" : "presentation";
    await openAudience(rehearsalEnabled ? undefined : selectedDisplay);
    setActiveMode(mode);
  };
  const stopAudience = async () => {
    await closeAudience();
    setActiveMode(null);
    setSlidesState({ deckLocked: false });
  };

  useEffect(() => {
    const filename = state.deckPath?.split(/[\\/]/).pop();
    void setWindowTitle("slides-presenter", filename ? `${filename} — Legend Slides` : "Legend Slides");
  }, [state.deckPath]);
  return (
    <View style={styles.root}>
      {state.component ? (
        <View style={styles.presenter}>
          <View style={styles.statusBar}>
            <PresenterClock audienceOpen={state.audienceOpen} rehearsal={activeMode === "rehearsal"} />
            <View style={styles.presentationControls}>
              {keyboardJump && <Text style={styles.keyboardJump}>Jump to {keyboardJump} ↵</Text>}
              {!state.audienceOpen ? (
                <>
                  <View style={styles.rehearsalToggle}>
                    <Text style={styles.controlLabel}>Rehearsal</Text>
                    <Switch accessibilityLabel="Rehearsal mode" onValueChange={setRehearsalEnabled} value={rehearsalEnabled} />
                  </View>
                  {!rehearsalEnabled && (
                    <View style={styles.displayChoices}>
                      {displays.map((display) => (
                        <Pressable
                          accessibilityRole="button"
                          key={display.id}
                          onPress={() => {
                            setSelectedDisplayId(display.id);
                            rememberPresentationDisplayId(display.id);
                          }}
                          style={[styles.displayChoice, selectedDisplayId === display.id && styles.displayChoiceSelected]}
                        >
                          <Text numberOfLines={1} style={styles.displayChoiceText}>{display.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <Button
                    disabled={!rehearsalEnabled && !selectedDisplay}
                    label={rehearsalEnabled ? "Start Rehearsal" : "Present"}
                    onPress={() => void startAudience()}
                    primary
                  />
                </>
              ) : (
                <>
                  <Text style={styles.activeMode}>{activeMode === "rehearsal" ? "Rehearsing" : "Presenting"}</Text>
                  <Button label="Stop" onPress={() => void stopAudience()} />
                </>
              )}
            </View>
          </View>

          <PresenterWorkspace
            currentIndex={state.currentSlide}
            nextIndex={Math.min(state.currentSlide + 1, state.slides.length - 1)}
            notes={currentNotes}
            resetVersion={presenterLayoutResetVersion}
            showNext={showNext}
            showNotes={showNotes}
            slideCount={state.slides.length}
          />

          {state.blackout && <Text style={styles.blackoutWarning}>Audience blacked out · press ⌘B to restore</Text>}
          {!!state.displayMessage && <Text style={styles.errorText}>{state.displayMessage}</Text>}
          {state.status === "building" && <Text style={styles.statusMessage}>Compiling changes…</Text>}
          {state.pendingDeck && (
            <View style={styles.updateBanner}>
              <Text style={styles.statusMessage}>Update ready: {state.pendingDeck.path.split("/").pop()}</Text>
              <Button label="Apply Update" onPress={applyPendingDeck} />
            </View>
          )}
          {(state.buildErrors.length > 0 || state.buildWarnings.length > 0) && (
            <View style={styles.errors}>
              <Text style={styles.errorTitle}>Build output</Text>
              {[...state.buildErrors, ...state.buildWarnings].map((message, index) => <Text key={`${index}:${message}`} style={styles.errorText}>{message}</Text>)}
              <Text style={styles.lastGood}>Showing the last successful build.</Text>
            </View>
          )}
          {state.runtimeErrors.length > 0 && (
            <View style={styles.errors}>
              <Text style={styles.errorTitle}>Slide errors</Text>
              {state.runtimeErrors.map((message) => <Text key={message} selectable style={styles.errorText}>{message}</Text>)}
              <Button label="Retry Slide Content" onPress={retrySlideContent} />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.empty}>
          {state.status === "building" ? <ActivityIndicator /> : <Text style={styles.emptyTitle}>No deck open</Text>}
          <Text style={styles.emptyBody}>Use File → Open… or press ⌘O.</Text>
          {state.buildErrors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  activeMode: { color: "#a1a1aa", fontSize: 12, fontWeight: "600", textTransform: "uppercase" },
  blackoutWarning: { backgroundColor: "#3f3006", borderRadius: 8, color: "#fde68a", marginTop: 12, padding: 10, textAlign: "center" },
  button: { backgroundColor: "#30323a", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  clockLabel: { color: "#71717a", fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  clockRight: { alignItems: "flex-end" },
  clockSection: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 24, minWidth: 250 },
  controlLabel: { color: "#d4d4d8", fontSize: 13, fontWeight: "600" },
  currentTime: { color: "#d4d4d8", fontSize: 17, fontVariant: ["tabular-nums"], fontWeight: "600", marginTop: 3 },
  disabled: { opacity: 0.4 },
  displayChoice: { borderColor: "#3f3f46", borderRadius: 8, borderWidth: 1, maxWidth: 160, paddingHorizontal: 10, paddingVertical: 8 },
  displayChoices: { flexDirection: "row", gap: 6 },
  displayChoiceSelected: { backgroundColor: "#272c3b", borderColor: "#60a5fa" },
  displayChoiceText: { color: "#d4d4d8", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center" },
  emptyBody: { color: "#a1a1aa", fontSize: 14 },
  emptyTitle: { color: "#fafafa", fontSize: 24, fontWeight: "700" },
  elapsed: { color: "#fafafa", fontSize: 26, fontVariant: ["tabular-nums"], fontWeight: "700", marginTop: 1 },
  errors: { backgroundColor: "#321f24", borderRadius: 8, marginTop: 12, maxHeight: 160, padding: 12 },
  errorText: { color: "#fda4af", fontFamily: "Menlo", fontSize: 11, marginTop: 6 },
  errorTitle: { color: "#fecdd3", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  keyboardJump: { color: "#93c5fd", fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "600" },
  lastGood: { color: "#fda4af", fontSize: 11, fontStyle: "italic", marginTop: 10 },
  notes: { flex: 1 },
  notesContent: { paddingHorizontal: 16, paddingVertical: 14 },
  notesHeader: { alignItems: "center", borderBottomColor: "#3f3f46", borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  notesPlaceholder: { color: "#71717a", fontStyle: "italic" },
  notesSection: { backgroundColor: "#202024", borderColor: "#3f3f46", borderRadius: 10, borderWidth: 1, minHeight: 0, overflow: "hidden" },
  notesSlide: { color: "#71717a", fontSize: 12, fontVariant: ["tabular-nums"] },
  notesText: { color: "#e4e4e7", fontSize: 17, lineHeight: 25 },
  notesTitle: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  presentationControls: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 10, justifyContent: "flex-end" },
  presenter: { flex: 1, padding: 18 },
  pressed: { opacity: 0.75 },
  horizontalResizeHandle: { height: "100%", width: 14 },
  horizontalResizeLine: { backgroundColor: "#3f3f46", height: "100%", width: StyleSheet.hairlineWidth },
  preview: { backgroundColor: "#000", borderColor: "#3f3f46", borderRadius: 10, borderWidth: 1, flex: 1, overflow: "hidden" },
  previews: { flexDirection: "row", minHeight: 0 },
  previewSection: { minWidth: 0 },
  primaryButton: { backgroundColor: "#2563eb" },
  primaryButtonText: { color: "#fff" },
  rehearsalToggle: { alignItems: "center", flexDirection: "row", gap: 6 },
  resizeHandle: { alignItems: "center", justifyContent: "center" },
  root: { backgroundColor: "#18181b", flex: 1 },
  statusBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  statusMessage: { color: "#a1a1aa", fontSize: 12 },
  timerActions: { flexDirection: "row", gap: 8 },
  updateBanner: { alignItems: "center", backgroundColor: "#272c3b", borderRadius: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 12, padding: 10 },
  verticalResizeHandle: { height: 14, width: "100%" },
  verticalResizeLine: { backgroundColor: "#3f3f46", height: StyleSheet.hairlineWidth, width: "100%" },
  workspace: { flex: 1, minHeight: 0 },
});
