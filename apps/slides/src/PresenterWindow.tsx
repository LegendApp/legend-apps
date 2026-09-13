import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legend-apps/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import { addRecentDocumentOpenListener } from "@legend-apps/recent-documents";
import {
  addDisplaysChangedListener,
  addWindowClosedListener,
  addWindowToolbarItemSelectedListener,
  closeWindow,
  getDisplays,
  setPreventDisplaySleep,
  setWindowOptions,
  setWindowTitle,
  setWindowToolbarItemText,
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
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { EditableMarkdown } from "./EditableMarkdown";
import { applyPendingDeck, getLastDeckPath, loadDeck } from "./deckLoader";
import {
  getPresentationDisplayId,
  getPresenterLayout,
  rememberPresentationDisplayId,
  rememberPresenterLayout,
  resetPresenterLayout as resetStoredPresenterLayout,
} from "./slidesPreferences";
import { defaultPresenterLayout, resizePresenterLayout } from "./presenterLayout";
import { getSlideStepCount, getNextPresentationTarget, nextSlide, previousSlide, retrySlideContent, setCurrentSlide, setSlidesState, slidesState$ } from "./slidesStore";
import { openSlidesSettingsWindow, slidesWindows } from "./slidesWindows";
import { createAudienceSession } from "./audienceSession";
import { useSlidesMenus } from "./slidesMenus";
import {
  createPresenterToolbarItems,
  formatPresenterElapsed,
  presenterDisplayToolbarItemId,
  presenterElapsedToolbarItemId,
  presenterModePresentationValue,
  presenterModeRehearsalValue,
  presenterModeToolbarItemId,
  presenterStartToolbarItemId,
  presenterStartValue,
  presenterStopValue,
  presenterTimerPauseValue,
  presenterTimerRestartValue,
  presenterTimerResumeValue,
} from "./presenterToolbar";
import {
  initialPresenterTimerState,
  transitionPresenterTimer,
  type PresenterMode,
  type PresenterTimerEvent,
} from "./presenterTimer";
import { persistSlideSpeakerNotes } from "./speakerNotesPersistence";
import {
  usePresentationTimerStartsOnSecondSlideSetting,
  useRehearsalTimerPausesWhileEditingSetting,
} from "./slidesSettings";

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

function Button({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function SlideCounter({ index }: { index: number }) {
  const total = useValue(() => slidesState$.slides.length);
  const step = useValue(slidesState$.currentStep);
  const stepCount = useValue(() => getSlideStepCount(slidesState$.slides[index].get()));
  if (total === 0) return null;
  return (
    <View pointerEvents="none" className="absolute right-3 top-3 rounded-md bg-zinc-900/90 px-3 py-1">
      <Text
        accessibilityLabel={`Slide ${index + 1} of ${total}, step ${step + 1} of ${stepCount}`}
        className="text-xs font-semibold text-zinc-200"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {index + 1} / {total} · Step {step + 1} / {stepCount}
      </Text>
    </View>
  );
}

function Preview({ index, live = false, stepIndex, weight = 1 }: { index: number; live?: boolean; stepIndex?: number; weight?: number }) {
  return (
    <View style={[styles.previewSection, { flex: weight }]}>
      <View style={styles.preview}>
        <SlideCanvas targetIndex={index} isPreview={!live}><DeckRenderer isPreview={!live} targetIndex={index} targetStep={stepIndex} /></SlideCanvas>
        {live && <SlideCounter index={index} />}
      </View>
    </View>
  );
}

function SpeakerNotes({
  deckPath,
  editable,
  notes,
  onEditingChange,
  onSave,
  slideIndex,
  weight,
}: {
  deckPath: string;
  editable: boolean;
  notes?: string;
  onEditingChange(editing: boolean): void;
  onSave(notes: string): Promise<void>;
  slideIndex: number;
  weight: number;
}) {
  const currentStep = useValue(slidesState$.currentStep);
  return (
    <View style={[styles.notesSection, { flex: weight }]}>
      <ScrollView key={`${deckPath}:${slideIndex}`} contentContainerStyle={styles.notesContent} style={styles.notes}>
        <EditableMarkdown
          editable={editable}
          currentStep={currentStep}
          markdown={notes ?? ""}
          onEditingChange={onEditingChange}
          onSave={onSave}
          placeholder={editable ? "Click to add speaker notes." : "No notes for this slide."}
        />
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
  currentStep: number;
  deckPath: string;
  nextIndex: number;
  nextStep: number;
  notesEditable: boolean;
  notes?: string;
  onNotesEditingChange(editing: boolean): void;
  onSaveNotes(deckPath: string, slideIndex: number, notes: string): Promise<void>;
  resetVersion: number;
  showNext: boolean;
  showNotes: boolean;
};

function PresenterWorkspace({
  currentIndex,
  currentStep,
  deckPath,
  nextIndex,
  nextStep,
  notesEditable,
  notes,
  onNotesEditingChange,
  onSaveNotes,
  resetVersion,
  showNext,
  showNotes,
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
        <Preview index={currentIndex} live stepIndex={currentStep} weight={showNext ? layout.currentPreviewRatio : 1} />
        {showNext && (
          <>
            <ResizeHandle
              direction="horizontal"
              label="Resize current and next slide previews"
              onResize={(delta) => resize("previews", delta)}
              onResizeEnd={persistLayout}
            />
            <Preview index={nextIndex} stepIndex={nextStep} weight={1 - layout.currentPreviewRatio} />
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
            deckPath={deckPath}
            editable={notesEditable}
            notes={notes}
            onEditingChange={onNotesEditingChange}
            onSave={(nextNotes) => onSaveNotes(deckPath, currentIndex, nextNotes)}
            slideIndex={currentIndex}
            weight={layout.notesRatio}
          />
        </>
      )}
    </View>
  );
}

type PresenterToolbarProps = {
  activeMode: PresenterMode | null;
  audienceOpen: boolean;
  currentSlide: number;
  displays: Display[];
  hasDeck: boolean;
  isEditing?: boolean;
  onDisplayChange(displayId: string): void;
  onModeChange(mode: PresenterMode): void;
  onStart(): Promise<void>;
  onStop(): Promise<void>;
  rehearsalEnabled: boolean;
  selectedDisplayId: string | null;
};

function PresenterToolbar({
  activeMode,
  audienceOpen,
  currentSlide,
  displays,
  hasDeck,
  isEditing = false,
  onDisplayChange,
  onModeChange,
  onStart,
  onStop,
  rehearsalEnabled,
  selectedDisplayId,
}: PresenterToolbarProps) {
  const presentationStartsOnSecondSlide = usePresentationTimerStartsOnSecondSlideSetting();
  const rehearsalPausesWhileEditing = useRehearsalTimerPausesWhileEditingSetting();
  const elapsedBeforeRun = useRef(0);
  const startedAt = useRef(0);
  const runningRef = useRef(false);
  const timerStateRef = useRef(initialPresenterTimerState);
  const audienceOpenRef = useRef(false);
  const previousSlideRef = useRef(currentSlide);
  const editingRef = useRef(isEditing);
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;

  const updateTimerClock = useCallback((nextRunning: boolean, restart: boolean) => {
    const now = Date.now();
    const wasRunning = runningRef.current;
    if (restart) {
      elapsedBeforeRun.current = 0;
      startedAt.current = now;
      setElapsed(0);
    } else if (nextRunning && !wasRunning) {
      startedAt.current = now;
    } else if (!nextRunning && wasRunning) {
      elapsedBeforeRun.current += now - startedAt.current;
      setElapsed(elapsedBeforeRun.current);
    }
    if (nextRunning !== wasRunning) {
      runningRef.current = nextRunning;
      setTimerRunning(nextRunning);
    }
  }, []);

  const applyTimerEvent = useCallback((event: PresenterTimerEvent) => {
    const transition = transitionPresenterTimer(timerStateRef.current, event, {
      presentationStartsOnSecondSlide,
      rehearsalPausesWhileEditing,
    });
    timerStateRef.current = transition.state;
    updateTimerClock(transition.state.running, transition.restart);
  }, [presentationStartsOnSecondSlide, rehearsalPausesWhileEditing, updateTimerClock]);

  useEffect(() => {
    if (audienceOpen === audienceOpenRef.current) {
      return;
    }
    audienceOpenRef.current = audienceOpen;
    applyTimerEvent(audienceOpen
      ? { mode: activeMode ?? (rehearsalEnabled ? "rehearsal" : "presentation"), type: "audience-started" }
      : { type: "audience-stopped" });
  }, [activeMode, applyTimerEvent, audienceOpen, rehearsalEnabled]);

  useEffect(() => {
    const previousSlide = previousSlideRef.current;
    previousSlideRef.current = currentSlide;
    if (audienceOpen && previousSlide !== currentSlide) {
      applyTimerEvent({ from: previousSlide, to: currentSlide, type: "slide-navigated" });
    }
  }, [applyTimerEvent, audienceOpen, currentSlide]);

  useEffect(() => {
    const editingStarted = isEditing && !editingRef.current;
    editingRef.current = isEditing;
    if (audienceOpen && editingStarted) {
      applyTimerEvent({ type: "editing-started" });
    }
  }, [applyTimerEvent, audienceOpen, isEditing]);

  useEffect(() => {
    if (!timerRunning) {
      return;
    }
    const interval = setInterval(() => {
      setElapsed(elapsedBeforeRun.current + Date.now() - startedAt.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  useEffect(() => {
    void setWindowOptions("slides-presenter", {
      windowStyle: {
        toolbarItems: createPresenterToolbarItems({
          audienceOpen,
          displays,
          elapsed: elapsedRef.current,
          hasDeck,
          rehearsalEnabled,
          selectedDisplayId,
          timerRunning,
        }),
      },
    });
  }, [audienceOpen, displays, hasDeck, rehearsalEnabled, selectedDisplayId, timerRunning]);

  useEffect(() => {
    void setWindowToolbarItemText("slides-presenter", presenterElapsedToolbarItemId, formatPresenterElapsed(elapsed));
  }, [elapsed]);

  useEffect(() => {
    const subscription = addWindowToolbarItemSelectedListener((event) => {
      if (event.identifier !== "slides-presenter") {
        return;
      }
      if (event.itemId === presenterElapsedToolbarItemId) {
        if (event.value === presenterTimerPauseValue) {
          applyTimerEvent({ type: "pause-requested" });
        } else if (event.value === presenterTimerResumeValue) {
          applyTimerEvent({ type: "resume-requested" });
        } else if (event.value === presenterTimerRestartValue) {
          applyTimerEvent({ type: "restart-requested" });
        }
      } else if (event.itemId === presenterModeToolbarItemId) {
        if (event.value === presenterModePresentationValue || event.value === presenterModeRehearsalValue) {
          onModeChange(event.value);
        }
      } else if (event.itemId === presenterDisplayToolbarItemId && displays.some((display) => display.id === event.value)) {
        onDisplayChange(event.value);
      } else if (event.itemId === presenterStartToolbarItemId) {
        if (event.value === presenterStartValue) {
          void onStart();
        } else if (event.value === presenterStopValue) {
          void onStop();
        }
      }
    });
    return () => subscription.remove();
  }, [applyTimerEvent, displays, onDisplayChange, onModeChange, onStart, onStop]);

  return null;
}

function launchDeckPath(launchArguments?: string[]) {
  return launchArguments?.find((argument) => argument.toLowerCase().endsWith(".mdx"));
}

export function PresenterWindow({ launchArguments }: PresenterWindowProps) {
  const [displays, setDisplays] = useState<Display[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null);
  const [rehearsalEnabled, setRehearsalEnabled] = useState(false);
  const [activeMode, setActiveMode] = useState<PresenterMode | null>(null);
  const [notesEditing, setNotesEditing] = useState(false);
  const [presenterLayoutResetVersion, setPresenterLayoutResetVersion] = useState(0);
  const keyboardJump$ = useObservable("");
  const keyboardJumpTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audienceOpen = useValue(slidesState$.audienceOpen);
  const blackout = useValue(slidesState$.blackout);
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

  useSlidesMenus(openDeck, audienceOpen, blackout, resetPresenterLayout, openSlidesSettingsWindow);

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
      if (notesEditing && event.keyCode !== KeyCodes.KEY_PAGE_DOWN && event.keyCode !== KeyCodes.KEY_PAGE_UP) {
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
      if (event.keyCode === KeyCodes.KEY_ESCAPE && audienceOpen) {
        void closeAudience();
        return true;
      }
      const digit = digitKeyCodes.get(event.keyCode);
      if (digit !== undefined) {
        const nextJump = `${keyboardJump$.peek()}${digit}`.replace(/^0+/, "").slice(0, 4);
        keyboardJump$.set(nextJump);
        if (keyboardJumpTimeout.current) {
          clearTimeout(keyboardJumpTimeout.current);
        }
        keyboardJumpTimeout.current = setTimeout(() => {
          keyboardJump$.set("");
        }, 2500);
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_RETURN && keyboardJump$.peek()) {
        setCurrentSlide(Number(keyboardJump$.peek()) - 1);
        keyboardJump$.set("");
        return true;
      }
      if (event.keyCode === KeyCodes.KEY_DELETE && keyboardJump$.peek()) {
        const nextJump = keyboardJump$.peek().slice(0, -1);
        keyboardJump$.set(nextJump);
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
  }, [closeAudience, keyboardJump$, notesEditing, audienceOpen]);

  useEffect(() => {
    void setPreventDisplaySleep(audienceOpen);
    return () => {
      if (audienceOpen) {
        void setPreventDisplaySleep(false);
      }
    };
  }, [audienceOpen]);

  const selectedDisplay = displays.find((display) => display.id === selectedDisplayId);
  const startAudience = useCallback(async () => {
    const mode = rehearsalEnabled ? "rehearsal" : "presentation";
    await openAudience(rehearsalEnabled ? undefined : selectedDisplay);
    setActiveMode(mode);
  }, [openAudience, rehearsalEnabled, selectedDisplay]);
  const stopAudience = useCallback(async () => {
    await closeAudience();
    setActiveMode(null);
    setSlidesState({ deckLocked: false });
  }, [closeAudience]);

  const selectDisplay = useCallback((displayId: string) => {
    setSelectedDisplayId(displayId);
    rememberPresentationDisplayId(displayId);
  }, []);

  const selectMode = useCallback((mode: PresenterMode) => {
    setRehearsalEnabled(mode === "rehearsal");
  }, []);

  const saveSpeakerNotes = useCallback(async (deckPath: string, slideIndex: number, notes: string) => {
    try {
      await persistSlideSpeakerNotes(deckPath, slideIndex, notes);
      setSlidesState((current) => current.deckPath === deckPath
        ? {
            displayMessage: "",
            slides: current.slides.map((slide, index) => index === slideIndex ? { ...slide, notes } : slide),
          }
        : {});
    } catch (error) {
      setSlidesState((current) => current.deckPath === deckPath
        ? { displayMessage: `Speaker notes: ${error instanceof Error ? error.message : String(error)}` }
        : {});
      throw error;
    }
  }, []);

  return (
    <View style={styles.root}>
      <ConnectedPresenterToolbar
        activeMode={activeMode}
        audienceOpen={audienceOpen}
        displays={displays}
        isEditing={notesEditing}
        onDisplayChange={selectDisplay}
        onModeChange={selectMode}
        onStart={startAudience}
        onStop={stopAudience}
        rehearsalEnabled={rehearsalEnabled}
        selectedDisplayId={selectedDisplayId}
      />
      <PresenterDeckContent
        keyboardJump$={keyboardJump$}
        notesEditable={!audienceOpen || activeMode === "rehearsal"}
        onNotesEditingChange={setNotesEditing}
        onSaveNotes={saveSpeakerNotes}
        resetVersion={presenterLayoutResetVersion}
      />
    </View>
  );
}

function ConnectedPresenterToolbar(props: Omit<Parameters<typeof PresenterToolbar>[0], "currentSlide" | "hasDeck">) {
  const currentSlide = useValue(slidesState$.currentSlide);
  const hasDeck = useValue(() => Boolean(slidesState$.compiled.get()));
  return <PresenterToolbar {...props} currentSlide={currentSlide} hasDeck={hasDeck} />;
}

function KeyboardJump({ value$ }: { value$: Observable<string> }) {
  const value = useValue(value$);
  return value ? <Text style={styles.keyboardJump}>Jump to {value} ↵</Text> : null;
}

function PresenterDeckContent({ keyboardJump$, notesEditable, onNotesEditingChange, onSaveNotes, resetVersion }: {
  keyboardJump$: Observable<string>;
  notesEditable: boolean;
  onNotesEditingChange: (editing: boolean) => void;
  onSaveNotes: (path: string, index: number, notes: string) => Promise<void>;
  resetVersion: number;
}) {
  const hasDeck = useValue(() => Boolean(slidesState$.compiled.get()));
  const currentSlide = useValue(slidesState$.currentSlide);
  const currentStep = useValue(slidesState$.currentStep);
  const deckPath = useValue(slidesState$.deckPath);
  const currentNotes = useValue(() => slidesState$.slides[currentSlide].notes.get());
  const nextSlideIndex = useValue(() => getNextPresentationTarget({
    currentSlide, currentStep, slides: slidesState$.slides.get(),
  }).slideIndex);
  const nextStepIndex = useValue(() => getNextPresentationTarget({
    currentSlide, currentStep, slides: slidesState$.slides.get(),
  }).stepIndex);
  const nextTarget = { slideIndex: nextSlideIndex, stepIndex: nextStepIndex };
  const showNext = useValue(() => slidesState$.config.presenter.showNext.get() !== false);
  const showNotes = useValue(() => slidesState$.config.presenter.showNotes.get() !== false);
  useEffect(() => {
    const filename = deckPath?.split(/[\\/]/).pop();
    void setWindowTitle("slides-presenter", filename ? `${filename} — Legend Slides` : "Legend Slides");
  }, [deckPath]);
  return (
    <>
      {hasDeck ? (
        <View style={styles.presenter}>
          <KeyboardJump value$={keyboardJump$} />

          <PresenterWorkspace
            currentIndex={currentSlide}
            currentStep={currentStep}
            deckPath={deckPath ?? ""}
            nextIndex={nextTarget.slideIndex}
            nextStep={nextTarget.stepIndex}
            notesEditable={notesEditable}
            notes={currentNotes}
            onNotesEditingChange={onNotesEditingChange}
            onSaveNotes={onSaveNotes}
            resetVersion={resetVersion}
            showNext={showNext}
            showNotes={showNotes}
          />

          <PresenterStatus />
        </View>
      ) : (
        <EmptyPresenter />
      )}
    </>
  );
}

function PresenterStatus() {
  const blackout = useValue(slidesState$.blackout);
  const state = {
    displayMessage: useValue(slidesState$.displayMessage),
    status: useValue(slidesState$.status),
    pendingDeck: useValue(slidesState$.pendingDeck),
    buildErrors: useValue(slidesState$.buildErrors),
    buildWarnings: useValue(slidesState$.buildWarnings),
    runtimeErrors: useValue(slidesState$.runtimeErrors),
  };
  return (
    <>
      {blackout && <Text style={styles.blackoutWarning}>Audience blacked out · press ⌘B to restore</Text>}
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
    </>
  );
}

function EmptyPresenter() {
  const state = { status: useValue(slidesState$.status), buildErrors: useValue(slidesState$.buildErrors) };
  return (
    <View style={styles.empty}>
      {state.status === "building" ? <ActivityIndicator /> : <Text style={styles.emptyTitle}>No deck open</Text>}
      <Text style={styles.emptyBody}>Use File → Open… or press ⌘O.</Text>
      {state.buildErrors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  blackoutWarning: { backgroundColor: "#3f3006", borderRadius: 8, color: "#fde68a", marginTop: 12, padding: 10, textAlign: "center" },
  button: { backgroundColor: "#30323a", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  buttonText: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.4 },
  empty: { alignItems: "center", flex: 1, gap: 14, justifyContent: "center" },
  emptyBody: { color: "#a1a1aa", fontSize: 14 },
  emptyTitle: { color: "#fafafa", fontSize: 24, fontWeight: "700" },
  errors: { backgroundColor: "#321f24", borderRadius: 8, marginTop: 12, maxHeight: 160, padding: 12 },
  errorText: { color: "#fda4af", fontFamily: "Menlo", fontSize: 11, marginTop: 6 },
  errorTitle: { color: "#fecdd3", fontSize: 13, fontWeight: "700" },
  keyboardJump: { backgroundColor: "#272c3b", borderRadius: 7, color: "#93c5fd", fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "600", paddingHorizontal: 9, paddingVertical: 6, position: "absolute", right: 22, top: 22, zIndex: 1 },
  lastGood: { color: "#fda4af", fontSize: 11, fontStyle: "italic", marginTop: 10 },
  notes: { flex: 1 },
  notesContent: { flexGrow: 1, paddingHorizontal: 16, paddingVertical: 14 },
  notesSection: { minHeight: 0, overflow: "hidden" },
  presenter: { flex: 1, padding: 14 },
  pressed: { opacity: 0.75 },
  horizontalResizeHandle: { height: "100%", width: 14 },
  horizontalResizeLine: { height: "100%", width: StyleSheet.hairlineWidth },
  preview: { flex: 1, overflow: "hidden" },
  previews: { flexDirection: "row", minHeight: 0 },
  previewSection: { minWidth: 0 },
  resizeHandle: { alignItems: "center", justifyContent: "center" },
  root: { backgroundColor: "#18181b", flex: 1 },
  statusMessage: { color: "#a1a1aa", fontSize: 12 },
  updateBanner: { alignItems: "center", backgroundColor: "#272c3b", borderRadius: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 12, padding: 10 },
  verticalResizeHandle: { height: 14, width: "100%" },
  verticalResizeLine: { height: StyleSheet.hairlineWidth, width: "100%" },
  workspace: { flex: 1, minHeight: 0 },
});
