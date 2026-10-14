import { speakerNotesDrafts } from "./speakerNotesDrafts";
import { preparePresenterSessionClose } from "./presenterClose";
import { assignDisplayRole, displayKey, rememberDisplayRoles, resolveDisplayRoles } from "./displayRoles";
import { displayRolesSetting, displayRolesConfiguredSetting, displayRoleHistorySetting, useDisplayRolesSetting } from "./slidesSettings";
import { resumeNotesOutput, identifyDisplays, previewNotesOutput, notesOutput$, notesOutputClosed, syncNotesOutput } from "./notesOutput";
import type { Observable } from "@legendapp/state";
import { useObservable, useObserveEffect, useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { createHotkeyRouter, useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { registerDocumentOpenGuard } from "./documentOpen";
import { beforeWindowClose, closeWindow, getDisplays, setWindowOptions, setWindowBounds, setWindowFullscreen, showWindow, type DisplayInfo } from "@legendapp/spark/windows";
import { addAppListener } from "@legendapp/spark/app";
import { onSystemEvent, preventSleep } from "@legendapp/spark/system";
import { addMacOSWindowListener, setToolbarItemText } from "@legendapp/spark/windows/macos";
import { openOrShowWindow, ownRegistration } from "@legend-apps/runtime-utils";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, } from "react-native";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { DeferredPresenterPreview } from "./DeferredPresenterPreview";
import { ScrollableNotes } from "./ScrollableNotes";
import { NotesEditingBoundary } from "./EditableMarkdown";
import { DeckEditor } from "./DeckEditor";
import { applyPendingDeck, loadDeck } from "./deckLoader";
import { EffectInstallStatus } from "./EffectInstallStatus";
import { getRehearsalEnabled, rememberRehearsalEnabled, getPresentationDisplayId, getPresenterLayout, rememberPresentationDisplayId, rememberPresenterLayout, resetPresenterLayout as resetStoredPresenterLayout, } from "./slidesPreferences";
import { defaultPresenterLayout, resizePresenterLayout } from "./presenterLayout";
import { createPresenterResizeResponder } from "./presenterResizeResponder";
import { getSlideStepCount, getNextPresentationTarget, nextSlide, previousSlide, retrySlideContent, setCurrentSlide, setSlidesState, slidesState$ } from "./slidesStore";
import { openSlidesSettingsWindow, slidesWindows } from "./slidesWindows";
import { audienceFullscreenForDisplayCount, createAudienceSession } from "./audienceSession";
import { useSlidesMenus } from "./slidesMenus";
import { presenterAppearanceToolbarItemId, createPresenterToolbarItems, formatPresenterElapsed, presenterDisplayToolbarItemId, presenterEditToolbarItemId, presenterElapsedToolbarItemId, presenterModePresentationValue, presenterModeRehearsalValue, presenterModeToolbarItemId, presenterStartToolbarItemId, presenterStartValue, presenterStopValue, presenterTimerPauseValue, presenterTimerRestartValue, presenterTimerResumeValue, } from "./presenterToolbar";
import { initialPresenterTimerState, transitionPresenterTimer, type PresenterMode, type PresenterTimerEvent, } from "./presenterTimer";
import { persistSlideSpeakerNotes } from "./speakerNotesPersistence";
import { usePresentationNotesFontSizeSetting, usePresentationNotesWidthSetting, useBackgroundIntensitySetting, setBackgroundIntensitySetting, usePresentationTimerStartsOnSecondSlideSetting, useRehearsalTimerPausesWhileEditingSetting, } from "./slidesSettings";
const presenterHotkeyRouter = createHotkeyRouter();
const pageDefinitions = [
    { id: "next", title: "Next Slide", defaultBindings: ["PageDown"], allowExtraModifiers: true, repeat: true },
    { id: "previous", title: "Previous Slide", defaultBindings: ["PageUp"], allowExtraModifiers: true, repeat: true },
];
const navigationDefinitions = [
    { id: "next", title: "Next Slide", defaultBindings: ["Right", "Down", "Space"], allowExtraModifiers: true, repeat: true },
    { id: "previous", title: "Previous Slide", defaultBindings: ["Left", "Up"], allowExtraModifiers: true, repeat: true },
    { id: "first", title: "First Slide", defaultBindings: ["Home"], allowExtraModifiers: true, repeat: true },
    { id: "last", title: "Last Slide", defaultBindings: ["End"], allowExtraModifiers: true, repeat: true },
    { id: "digit", title: "Jump to Slide", defaultBindings: Array.from({ length: 10 }, (_, i) => String(i)), allowExtraModifiers: true, repeat: true },
];
const jumpDefinitions = [
    { id: "jump", title: "Confirm Slide Number", defaultBindings: ["Enter"], allowExtraModifiers: true },
    { id: "delete", title: "Delete Slide Number", defaultBindings: ["Backspace"], allowExtraModifiers: true, repeat: true },
];
const escapeDefinitions = [{ id: "close", title: "Close Audience", defaultBindings: ["Escape"], allowExtraModifiers: true }];
function PresenterKeyboard({ windowId, editingDeck, presenter$, keyboardJump$, audienceOpen, closeAudience, jumpTimeout }: {
    windowId: string; editingDeck: boolean; presenter$: Observable<PresenterSession>;
    keyboardJump$: Observable<string>; audienceOpen: boolean; closeAudience(): Promise<unknown>; jumpTimeout: { current: ReturnType<typeof setTimeout> | undefined };
}) {
    const notesEditing = useValue(presenter$.notesEditing);
    const hasJump = useValue(() => Boolean(keyboardJump$.get()));
    useEffect(() => () => clearTimeout(jumpTimeout.current), [jumpTimeout]);
    const scope = { kind: "window" as const, windowId };
    const handlers = { next: nextSlide, previous: previousSlide };
    useRoutedHotkeys({ router: presenterHotkeyRouter, definitions: pageDefinitions, scope, enabled: !editingDeck, handlers, onError: console.error });
    useRoutedHotkeys({ router: presenterHotkeyRouter, definitions: navigationDefinitions, scope, enabled: !editingDeck && !notesEditing,
        handlers: { ...handlers, first: () => setCurrentSlide(0), last: () => setCurrentSlide(Number.MAX_SAFE_INTEGER), digit: ({ event }) => {
            keyboardJump$.set(`${keyboardJump$.peek()}${event.key}`.replace(/^0+/, "").slice(0, 4));
            clearTimeout(jumpTimeout.current);
            jumpTimeout.current = setTimeout(() => keyboardJump$.set(""), 2500);
        } }, onError: console.error });
    useRoutedHotkeys({ router: presenterHotkeyRouter, definitions: jumpDefinitions, scope, enabled: !editingDeck && !notesEditing && hasJump,
        handlers: { jump: () => { setCurrentSlide(Number(keyboardJump$.peek()) - 1); keyboardJump$.set(""); }, delete: () => keyboardJump$.set(keyboardJump$.peek().slice(0, -1)) }, onError: console.error });
    useRoutedHotkeys({ router: presenterHotkeyRouter, definitions: escapeDefinitions, scope, enabled: !editingDeck && !notesEditing && audienceOpen,
        handlers: { close: () => { void closeAudience(); } }, onError: console.error });
    return null;
}
function Button({ disabled, label, onPress }: {
    disabled?: boolean;
    label: string;
    onPress(): void;
}) {
    return (<Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>);
}
function SlideCounter({ index }: {
    index: number;
}) {
    const total = useValue(() => slidesState$.slides.length);
    const step = useValue(slidesState$.currentStep);
    const stepCount = useValue(() => getSlideStepCount(slidesState$.slides[index].get()));
    if (total === 0)
        return null;
    return (<View accessible accessibilityLabel={`Slide ${index + 1} of ${total}, step ${step + 1} of ${stepCount}`} pointerEvents="none" className="absolute right-3 top-3 rounded-md bg-zinc-900/90 px-3 py-1">
      <Text className="text-xs font-semibold text-zinc-200" style={{ fontVariant: ["tabular-nums"] }}>
        {index + 1} / {total} · Step {step + 1} / {stepCount}
      </Text>
    </View>);
}
function Preview({ index, current = false, animate = false, stepIndex, weight = 1 }: {
    index: number;
    current?: boolean;
    animate?: boolean;
    stepIndex?: number;
    weight?: number;
}) {
    return (<View style={[styles.previewSection, { flex: weight }]}>
      <View style={styles.preview}>
        <SlideCanvas targetIndex={index} isPreview={!animate} backgroundIsPreview><DeckRenderer isPreview={!animate} targetIndex={index} targetStep={stepIndex}/></SlideCanvas>
        {current && <SlideCounter index={index}/>}
      </View>
    </View>);
}
function SpeakerNotes({ deckPath, editable, notes, onEditingChange, onSave, slideIndex, weight, }: {
    deckPath: string;
    editable: boolean;
    notes?: string;
    onEditingChange(editing: boolean): void;
    onSave(notes: string, target: string, expectedNotes: string | undefined): Promise<void>;
    slideIndex: number;
    weight: number;
}) {
    const currentStep = useValue(slidesState$.currentStep);
    const noteTarget = useValue(() => slidesState$.noteTargets[slideIndex].get());
    const draftPrefix = `${JSON.stringify([deckPath, slideIndex])}:`;
    const draftKey = speakerNotesDrafts.key(draftPrefix, noteTarget ?? "");
    const notesWidth = usePresentationNotesWidthSetting();
    const notesFontSize = usePresentationNotesFontSizeSetting();
    return (<View style={[styles.notesSection, { flex: weight }]}>
      <ScrollableNotes key={`${deckPath}:${slideIndex}`} notesWidth={notesWidth} editable={editable} fontSize={notesFontSize} currentStep={currentStep} draftKey={draftKey} drafts={speakerNotesDrafts} markdown={notes ?? ""} onEditingChange={onEditingChange} onSave={(value, expectedNotes) => onSave(value, draftKey.slice(draftPrefix.length), expectedNotes)} placeholder={editable ? "Click to add speaker notes." : "No notes for this slide."}/>
    </View>);
}
type ResizeHandleProps = {
    direction: "horizontal" | "vertical";
    label: string;
    onResize(delta: number): void;
    onResizeEnd(): void;
};
function ResizeHandle({ direction, label, onResize, onResizeEnd }: ResizeHandleProps) {
    const [resizeResponder] = useState(() => createPresenterResizeResponder({ direction, onResize, onResizeEnd }));
    useLayoutEffect(() => {
        resizeResponder.updateCallbacks({ direction, onResize, onResizeEnd });
    }, [direction, onResize, onResizeEnd, resizeResponder]);
    return (<View accessibilityActions={[{ name: "decrement" }, { name: "increment" }]} accessibilityLabel={label} accessibilityRole="adjustable" onAccessibilityAction={(event) => {
            onResize(event.nativeEvent.actionName === "increment" ? 24 : -24);
            onResizeEnd();
        }} style={[
            styles.resizeHandle,
            direction === "horizontal" ? styles.horizontalResizeHandle : styles.verticalResizeHandle,
            // React Native macOS supports resize cursors that are missing from the core ViewStyle type.
            { cursor: direction === "horizontal" ? "ew-resize" : "ns-resize" } as any,
        ]} {...resizeResponder.panHandlers}>
      <View style={direction === "horizontal" ? styles.horizontalResizeLine : styles.verticalResizeLine}/>
    </View>);
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
    onSaveNotes(deckPath: string, slideIndex: number, notes: string, target: string, expectedNotes: string | undefined): Promise<void>;
    resetVersion: number;
    showNext: boolean;
    showNotes: boolean;
};
function PresenterWorkspace({ currentIndex, currentStep, deckPath, nextIndex, nextStep, notesEditable, notes, onNotesEditingChange, onSaveNotes, resetVersion, showNext, showNotes, }: PresenterWorkspaceProps) {
    const audienceOpen = useValue(slidesState$.audienceOpen);
    const layout$ = useObservable(() => getPresenterLayout());
    const layout = useValue(layout$);
    const workspaceSizeRef = useRef({ height: 0, width: 0 });
    useEffect(() => {
        if (resetVersion === 0)
            return;
        layout$.set(defaultPresenterLayout);
    }, [resetVersion, layout$]);
    const handleWorkspaceLayout = useCallback((event: LayoutChangeEvent) => {
        workspaceSizeRef.current = event.nativeEvent.layout;
    }, []);
    const resize = useCallback((divider: "previews" | "notes", delta: number) => {
        const availableSize = divider === "previews"
            ? workspaceSizeRef.current.width
            : workspaceSizeRef.current.height;
        const nextLayout = resizePresenterLayout(layout$.peek(), divider, delta, availableSize);
        if (nextLayout === layout$.peek())
            return;
        layout$.set(nextLayout);
    }, [layout$]);
    const persistLayout = useCallback(() => rememberPresenterLayout(layout$.peek()), [layout$]);
    const previewWeight = showNotes ? 1 - layout.notesRatio : 1;
    const nextPreview = <Preview index={nextIndex} stepIndex={nextStep}/>;
    return (<View onLayout={handleWorkspaceLayout} style={styles.workspace}>
      <View style={[styles.previews, { flex: previewWeight }]}>
        <Preview index={currentIndex} current animate={!audienceOpen} stepIndex={currentStep} weight={showNext ? layout.currentPreviewRatio : 1}/>
        {showNext && (<>
            <ResizeHandle direction="horizontal" label="Resize current and next slide previews" onResize={(delta) => resize("previews", delta)} onResizeEnd={persistLayout}/>
            <DeferredPresenterPreview weight={1 - layout.currentPreviewRatio}>
              {nextPreview}
            </DeferredPresenterPreview>
          </>)}
      </View>
      {showNotes && (<>
          <ResizeHandle direction="vertical" label="Resize slide previews and speaker notes" onResize={(delta) => resize("notes", delta)} onResizeEnd={persistLayout}/>
          <SpeakerNotes deckPath={deckPath} editable={notesEditable} notes={notes} onEditingChange={onNotesEditingChange} onSave={(nextNotes, target, expectedNotes) => onSaveNotes(deckPath, currentIndex, nextNotes, target, expectedNotes)} slideIndex={currentIndex} weight={layout.notesRatio}/>
        </>)}
    </View>);
}
type PresenterToolbarProps = {
    activeMode: PresenterMode | null;
    audienceOpen: boolean;
    currentSlide: number;
    displays: DisplayInfo[];
    hasDeck: boolean;
    isEditing?: boolean;
    canEditDeck: boolean;
    onEditDeck(): void;
    onDisplayChange(displayId: string): void;
    onModeChange(mode: PresenterMode): void;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    rehearsalEnabled: boolean;
    selectedDisplayId: string | null;
};
function PresenterToolbar({ activeMode, audienceOpen, currentSlide, displays, hasDeck, isEditing = false, canEditDeck, onEditDeck, onDisplayChange, onModeChange, onStart, onStop, rehearsalEnabled, selectedDisplayId, }: PresenterToolbarProps) {
    const presentationStartsOnSecondSlide = usePresentationTimerStartsOnSecondSlideSetting();
    const backgroundIntensity = useBackgroundIntensitySetting();
    const displayRoles = useDisplayRolesSetting();
    const rehearsalPausesWhileEditing = useRehearsalTimerPausesWhileEditingSetting();
    const elapsedBeforeRun = useRef(0);
    const startedAt = useRef(0);
    const timerRunning$ = useObservable(false);
    const timerStateRef = useRef(initialPresenterTimerState);
    const audienceOpenRef = useRef(false);
    const previousSlideRef = useRef(currentSlide);
    const editingRef = useRef(isEditing);
    const elapsed$ = useObservable(0);
    const setElapsed = elapsed$.set;
    const updateTimerClock = useCallback((nextRunning: boolean, restart: boolean) => {
        const now = Date.now();
        const wasRunning = timerRunning$.peek();
        if (restart) {
            elapsedBeforeRun.current = 0;
            startedAt.current = now;
            setElapsed(0);
        }
        else if (nextRunning && !wasRunning) {
            startedAt.current = now;
        }
        else if (!nextRunning && wasRunning) {
            elapsedBeforeRun.current += now - startedAt.current;
            setElapsed(elapsedBeforeRun.current);
        }
        if (nextRunning !== wasRunning) {
            timerRunning$.set(nextRunning);
        }
    }, [setElapsed, timerRunning$]);
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
    useObserveEffect((event) => {
        if (!timerRunning$.get())
            return;
        const interval = setInterval(() => {
            elapsed$.set(elapsedBeforeRun.current + Date.now() - startedAt.current);
        }, 1000);
        event.onCleanup = () => clearInterval(interval);
    });
    useObserveEffect(() => {
        void setWindowOptions("slides-presenter", {
            ...{
                macos: {
                    toolbar: {
                        items: createPresenterToolbarItems({
                            audienceOpen, backgroundIntensity, canEditDeck, displays, elapsed: elapsed$.peek(), hasDeck,
                            displayRoles, rehearsalEnabled, selectedDisplayId, timerRunning: timerRunning$.get(),
                        })
                    }
                }
            }
        });
    }, [audienceOpen, backgroundIntensity, canEditDeck, displays, hasDeck, rehearsalEnabled, selectedDisplayId, displayRoles]);
    useObserveEffect(() => {
        const elapsed = elapsed$.get();
        notesOutput$.elapsed.set(elapsed);
        void setToolbarItemText("slides-presenter", presenterElapsedToolbarItemId, formatPresenterElapsed(elapsed));
    });
    useEffect(() => {
        const subscription = ownRegistration(addMacOSWindowListener("slides-presenter", (nativeEvent) => {
            if (nativeEvent.type !== "toolbarAction" && nativeEvent.type !== "toolbarMenuAction") return;
            const event = { itemId: nativeEvent.itemId, value: nativeEvent.type === "toolbarMenuAction" ? nativeEvent.action.itemId : nativeEvent.itemId === presenterStartToolbarItemId ? (audienceOpen ? presenterStopValue : presenterStartValue) : undefined };
            if (nativeEvent.type === "toolbarMenuAction" && nativeEvent.action.type === "valueChanged" && nativeEvent.action.itemId === "background-intensity") setBackgroundIntensitySetting(nativeEvent.action.value / 100 * 6);
            if (event.itemId === presenterAppearanceToolbarItemId) {
                const match = /^background-intensity:(\d+)$/.exec(event.value ?? "");
                if (match && Number(match[1]) <= 100)
                    setBackgroundIntensitySetting(Number(match[1]) / 100 * 6);
            }
            else if (event.itemId === presenterEditToolbarItemId) {
                if (!audienceOpen && canEditDeck)
                    onEditDeck();
            }
            else if (event.itemId === presenterElapsedToolbarItemId) {
                if (event.value === presenterTimerPauseValue) {
                    applyTimerEvent({ type: "pause-requested" });
                }
                else if (event.value === presenterTimerResumeValue) {
                    applyTimerEvent({ type: "resume-requested" });
                }
                else if (event.value === presenterTimerRestartValue) {
                    applyTimerEvent({ type: "restart-requested" });
                }
            }
            else if (event.itemId === presenterModeToolbarItemId) {
                if (event.value === presenterModePresentationValue || event.value === presenterModeRehearsalValue) {
                    onModeChange(event.value);
                }
            }
            else if (event.itemId === presenterDisplayToolbarItemId) {
                if (event.value === "open-audience")
                    void onStart();
                else if (event.value === "close-audience")
                    void onStop();
                else if (event.value === "identify-displays")
                    void identifyDisplays(displays);
                else if (event.value === "preview-notes")
                    void previewNotesOutput();
                else if (event.value?.startsWith("role:"))
                    onDisplayChange(event.value);
                else if (displays.some(display => display.id === event.value))
                    onDisplayChange(event.value!);
            }
            else if (event.itemId === presenterStartToolbarItemId) {
                if (event.value === presenterStartValue) {
                    void onStart();
                }
                else if (event.value === presenterStopValue) {
                    void onStop();
                }
            }
        }));
        return () => { void subscription.remove().catch(console.error); };
    }, [applyTimerEvent, audienceOpen, canEditDeck, displays, onEditDeck, onDisplayChange, onModeChange, onStart, onStop]);
    return null;
}
export function PresenterWindow() {
    useEffect(() => { resumeNotesOutput(); }, []);
    const closingPresenter = useRef(false);
    const [editingDeck, setEditingDeck] = useState(false);
    const editingDeckRef = useRef(false);
    editingDeckRef.current = editingDeck;
    const deckPath = useValue(slidesState$.deckPath);
    const finishEditing = () => {
        setEditingDeck(false);
        editingDeckRef.current = false;
        if (deckPath)
            void loadDeck(deckPath, false);
    };
    const presenter$ = useObservable<PresenterSession>({
        displays: [], selectedDisplayId: null, rehearsalEnabled: getRehearsalEnabled(),
        activeMode: null, notesEditing: false, presenterLayoutResetVersion: 0,
    });
    // Observable method reads return new wrappers. Capture them once for this
    // session so window subscriptions and toolbar effects do not restart on renders.
    const [{ setDisplays, setSelectedDisplayId, setRehearsalEnabled, setActiveMode, setNotesEditing, setPresenterLayoutResetVersion }] = useState(() => ({
        setDisplays: presenter$.displays.set,
        setSelectedDisplayId: presenter$.selectedDisplayId.set,
        setRehearsalEnabled: presenter$.rehearsalEnabled.set,
        setActiveMode: presenter$.activeMode.set,
        setNotesEditing: presenter$.notesEditing.set,
        setPresenterLayoutResetVersion: presenter$.presenterLayoutResetVersion.set,
    }));
    const keyboardJump$ = useObservable("");
    const jumpTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const audienceOpen = useValue(slidesState$.audienceOpen);
    const blackout = useValue(slidesState$.blackout);
    const [audience] = useState(() => createAudienceSession({
        async open(display, fullscreen) {
            await openOrShowWindow("slides-audience", () => slidesWindows.open("SlidesAudienceWindow", { options: { size: display.size, position: { displayId: display.id, x: 0, y: 0 }, macos: { titleBar: { titleVisibility: "hidden", transparent: true } } } }));
            await setWindowBounds("slides-audience", { displayId: display.id, x: 0, y: 0, ...display.size });
            await setWindowFullscreen("slides-audience", fullscreen);
        },
        async close() {
            const result = await closeWindow("slides-audience");
            if (!result.closed) throw new Error("Closing the audience window was vetoed.");
        },
        async focusPresenter() { await showWindow("slides-presenter"); },
        update: setSlidesState,
    }));
    useEffect(() => {
        let active = true;
        const subscription = ownRegistration(beforeWindowClose("slides-presenter", async () => {
            if (!active || closingPresenter.current) return false;
            closingPresenter.current = true;
            try { return await preparePresenterSessionClose(audience.close); }
            catch (error) { Alert.alert("Could not close window", String(error)); return false; }
            finally { closingPresenter.current = false; }
        }));
        return () => { active = false; void subscription.remove().catch(console.error); };
    }, [audience]);
    const refreshDisplays = useCallback(async () => {
        const nextDisplays = await getDisplays();
        if (closingPresenter.current)
            return;
        const previousDisplays = presenter$.displays.peek();
        setDisplays(nextDisplays);
        await audience.displaysChanged(nextDisplays);
        const current = displayRolesSetting.get();
        let history = rememberDisplayRoles(displayRoleHistorySetting.get(), previousDisplays, current);
        const roles = resolveDisplayRoles(nextDisplays, previousDisplays, current, history);
        history = rememberDisplayRoles(history, nextDisplays, roles);
        displayRoleHistorySetting.set(history);
        displayRolesSetting.set(roles);
        displayRolesConfiguredSetting.set(true);
        const selected = nextDisplays.find(d => displayKey(d) === roles.audience);
        setSelectedDisplayId(selected?.id ?? null);
        await syncNotesOutput(nextDisplays, slidesState$.audienceOpen.peek());
    }, [audience, setDisplays, setSelectedDisplayId]);
    const canOpenDeck = useCallback(() => {
        if (!editingDeckRef.current)
            return true;
        Alert.alert("Finish editing first", "Turn off source editing with the toolbar button before opening another deck. Changes save automatically.");
        return false;
    }, []);
    const openDeck = useCallback(async () => {
        if (!canOpenDeck())
            return;
        const paths = await openFileDialog({
            filters: [{ extensions: ["mdx"] }],
            multiple: false,
            selection: "files",
            message: "Choose an MDX presentation",
            prompt: "Open Deck",
        });
        if (!paths.canceled && paths.paths[0]) {
            await loadDeck(paths.paths[0]);
        }
    }, [canOpenDeck]);
    const resetPresenterLayout = useCallback(() => {
        resetStoredPresenterLayout();
        setPresenterLayoutResetVersion((version) => version + 1);
    }, [setPresenterLayoutResetVersion]);
    useSlidesMenus(openDeck, audienceOpen, blackout, resetPresenterLayout, openSlidesSettingsWindow);
    const openAudience = audience.open;
    const closeAudience = audience.close;
    useEffect(() => {
        void refreshDisplays();
        const displaysSubscription = ownRegistration(onSystemEvent(event => { if (event.type === "displaysChanged") void refreshDisplays().catch(console.error); }));
        const unregisterDocumentGuard = registerDocumentOpenGuard(() => !editingDeckRef.current);
        const closedSubscription = ownRegistration(addAppListener("windowClosed", (event) => {
            if (event.windowId === "slides-notes")
                notesOutputClosed();
            if (event.windowId === "slides-audience") {
                audience.closed();
                setActiveMode(null);
                setSlidesState({ deckLocked: false });
            }
        }));
        return () => {
            void displaysSubscription.remove().catch(console.error);
            unregisterDocumentGuard();
            void closedSubscription.remove().catch(console.error);
        };
    }, [audience, refreshDisplays, setActiveMode, canOpenDeck]);
    useEffect(() => {
        if (!audienceOpen) return;
        const registration = ownRegistration(preventSleep({ reason: "Presenting a slide deck", kind: "display" }));
        return () => { void registration.remove().catch(console.error); };
    }, [audienceOpen]);
    const startAudience = useCallback(async () => {
        if (closingPresenter.current)
            return;
        const { displays, selectedDisplayId, rehearsalEnabled } = presenter$.peek();
        const selectedDisplay = displays.length === 1 ? displays[0] : displays.find((display) => display.id === selectedDisplayId);
        const mode = rehearsalEnabled ? "rehearsal" : "presentation";
        if (selectedDisplay) {
            notesOutput$.preview.set(false);
            if (await openAudience(selectedDisplay, rehearsalEnabled, audienceFullscreenForDisplayCount(displays.length)))
                setActiveMode(mode);
        }
    }, [openAudience, setActiveMode, presenter$]);
    const stopAudience = useCallback(async () => {
        if (await closeAudience())
            setActiveMode(null);
    }, [closeAudience, setActiveMode]);
    const selectDisplay = useCallback((value: string) => {
        if (closingPresenter.current)
            return;
        const match = /^role:(audience|notes|unused):(.+)$/.exec(value);
        const display = presenter$.displays.peek().find(d => d.id === (match?.[2] ?? value));
        if (!display)
            return;
        const roles = assignDisplayRole(displayRolesSetting.get(), displayKey(display), (match?.[1] ?? "audience") as "audience" | "notes" | "unused");
        displayRolesSetting.set(roles);
        displayRoleHistorySetting.set(rememberDisplayRoles(displayRoleHistorySetting.get(), presenter$.displays.peek(), roles));
        displayRolesConfiguredSetting.set(true);
        const selected = presenter$.displays.peek().find(d => displayKey(d) === roles.audience);
        setSelectedDisplayId(selected?.id ?? null);
        if (selected)
            rememberPresentationDisplayId(selected.id);
        void (async () => {
            if (slidesState$.audienceOpen.peek()) {
                // Close the old notes output before changing roles, avoiding overlap.
                await syncNotesOutput([], false);
                if (closingPresenter.current)
                    return;
                if (selected)
                    await openAudience(selected, presenter$.rehearsalEnabled.peek(), audienceFullscreenForDisplayCount(presenter$.displays.peek().length));
                else
                    await closeAudience();
            }
            await syncNotesOutput(presenter$.displays.peek(), slidesState$.audienceOpen.peek());
        })();
    }, [presenter$, setSelectedDisplayId, openAudience, closeAudience]);
    useEffect(() => { void syncNotesOutput(presenter$.displays.peek(), audienceOpen); }, [audienceOpen, presenter$]);
    const selectMode = useCallback((mode: PresenterMode) => {
        setRehearsalEnabled(mode === "rehearsal");
        rememberRehearsalEnabled(mode === "rehearsal");
    }, [setRehearsalEnabled]);
    const saveSpeakerNotes = useCallback(async (deckPath: string, slideIndex: number, notes: string, target: string, expectedNotes: string | undefined) => {
        try {
            await persistSlideSpeakerNotes(deckPath, slideIndex, notes, target, expectedNotes);
            setSlidesState((current) => current.deckPath === deckPath && current.noteTargets?.[slideIndex] === target
                ? {
                    displayMessage: "",
                    slides: current.slides.map((slide, index) => index === slideIndex ? { ...slide, notes } : slide),
                }
                : {});
        }
        catch (error) {
            const displayMessage = `Speaker notes for slide ${slideIndex + 1} were not saved. Open that slide's notes to review the warning and recovery choices.`;
            setSlidesState((current) => current.deckPath === deckPath
                ? { displayMessage }
                : {});
            throw error;
        }
    }, []);
    return (<NotesEditingBoundary style={styles.root}>
      {["slides-presenter", "slides-audience", "slides-notes"].map(windowId => <PresenterKeyboard key={windowId} windowId={windowId} editingDeck={editingDeck} presenter$={presenter$} keyboardJump$={keyboardJump$} audienceOpen={audienceOpen} closeAudience={closeAudience} jumpTimeout={jumpTimeout}/>) }
      {editingDeck && deckPath ? <DeckEditor path={deckPath} onExit={finishEditing}/> : <>
      <ConnectedPresenterToolbar presenter$={presenter$} audienceOpen={audienceOpen} canEditDeck={Boolean(deckPath)} onEditDeck={() => setEditingDeck(true)} onDisplayChange={selectDisplay} onModeChange={selectMode} onStart={startAudience} onStop={stopAudience}/>
      <PresenterDeckContent keyboardJump$={keyboardJump$} presenter$={presenter$} onNotesEditingChange={setNotesEditing} onSaveNotes={saveSpeakerNotes}/>
      </>}
      <BlackoutBanner/>
    </NotesEditingBoundary>);
}
// The audience sees only black while this is on, so it spans the presenter's
// bottom edge over the workspace rather than sitting inline where it can scroll
// out of view or be mistaken for one status line among many.
function BlackoutBanner() {
    const blackout = useValue(slidesState$.blackout);
    if (!blackout)
        return null;
    return (<View className="absolute bottom-0 left-0 right-0 z-50" pointerEvents="box-none">
      <View className="flex-row items-center justify-center gap-4 border-t border-amber-400/40 bg-amber-950/95 px-6 py-4">
        <Text className="flex-1 text-base font-bold text-amber-100">Audience is blacked out</Text>
        <Button label="Restore Audience" onPress={() => setSlidesState({ blackout: false })}/>
      </View>
    </View>);
}
type PresenterSession = {
    displays: DisplayInfo[];
    selectedDisplayId: string | null;
    rehearsalEnabled: boolean;
    activeMode: PresenterMode | null;
    notesEditing: boolean;
    presenterLayoutResetVersion: number;
};
function ConnectedPresenterToolbar({ presenter$, ...props }: Omit<PresenterToolbarProps, "currentSlide" | "hasDeck" | "activeMode" | "displays" | "isEditing" | "rehearsalEnabled" | "selectedDisplayId"> & {
    presenter$: Observable<PresenterSession>;
}) {
    const activeMode = useValue(presenter$.activeMode);
    const displays = useValue(presenter$.displays);
    const isEditing = useValue(presenter$.notesEditing);
    const rehearsalEnabled = useValue(presenter$.rehearsalEnabled);
    const selectedDisplayId = useValue(presenter$.selectedDisplayId);
    const currentSlide = useValue(slidesState$.currentSlide);
    const hasDeck = useValue(() => Boolean(slidesState$.compiled.get()));
    return <PresenterToolbar {...props} currentSlide={currentSlide} hasDeck={hasDeck} activeMode={activeMode} displays={displays} isEditing={isEditing} rehearsalEnabled={rehearsalEnabled} selectedDisplayId={selectedDisplayId}/>;
}
function KeyboardJump({ value$ }: {
    value$: Observable<string>;
}) {
    const value = useValue(value$);
    return value ? <Text style={styles.keyboardJump}>Jump to {value} ↵</Text> : null;
}
function PresenterDeckContent({ keyboardJump$, presenter$, onNotesEditingChange, onSaveNotes }: {
    keyboardJump$: Observable<string>;
    presenter$: Observable<PresenterSession>;
    onNotesEditingChange: (editing: boolean) => void;
    onSaveNotes: (path: string, index: number, notes: string, target: string, expectedNotes: string | undefined) => Promise<void>;
}) {
    const notesEditable = useValue(presenter$.rehearsalEnabled);
    const resetVersion = useValue(presenter$.presenterLayoutResetVersion);
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
        void setWindowOptions("slides-presenter", { title: filename ? `${filename} — Legend Slides` : "Legend Slides" }).catch(console.error);
    }, [deckPath]);
    return (<>
      <EffectInstallStatus />
      {hasDeck ? (<View style={styles.presenter}>
          <KeyboardJump value$={keyboardJump$}/>

          <PresenterWorkspace currentIndex={currentSlide} currentStep={currentStep} deckPath={deckPath ?? ""} nextIndex={nextTarget.slideIndex} nextStep={nextTarget.stepIndex} notesEditable={notesEditable} notes={currentNotes} onNotesEditingChange={onNotesEditingChange} onSaveNotes={onSaveNotes} resetVersion={resetVersion} showNext={showNext} showNotes={showNotes}/>

          <PresenterStatus />
        </View>) : (<EmptyPresenter />)}
    </>);
}
function PresenterStatus() {
    const state = {
        displayMessage: useValue(slidesState$.displayMessage),
        status: useValue(slidesState$.status),
        pendingDeck: useValue(slidesState$.pendingDeck),
        buildErrors: useValue(slidesState$.buildErrors),
        buildWarnings: useValue(slidesState$.buildWarnings),
        runtimeErrors: useValue(slidesState$.runtimeErrors),
    };
    useObserveEffect(() => {
        if (!slidesState$.deckLocked.get() && slidesState$.pendingDeck.get())
            applyPendingDeck();
    });
    return (<>
      {!!state.displayMessage && <Text style={styles.errorText}>{state.displayMessage}</Text>}
      {state.status === "building" && (<View pointerEvents="none" style={styles.compilingOverlay}>
          <Text style={styles.statusMessage}>Compiling changes…</Text>
        </View>)}
      {state.pendingDeck && (<View style={styles.updateBanner}>
          <Text style={styles.statusMessage}>Changes will appear when the presentation ends</Text>
        </View>)}
      {(state.buildErrors.length > 0 || state.buildWarnings.length > 0) && (<View style={styles.errors}>
          <Text style={styles.errorTitle}>Build output</Text>
          {[...state.buildErrors, ...state.buildWarnings].map((message, index) => <Text key={`${index}:${message}`} style={styles.errorText}>{message}</Text>)}
          <Text style={styles.lastGood}>Showing the last successful build.</Text>
        </View>)}
      {state.runtimeErrors.length > 0 && (<View style={styles.errors}>
          <Text style={styles.errorTitle}>Slide errors</Text>
          {state.runtimeErrors.map((message) => <Text key={message} selectable style={styles.errorText}>{message}</Text>)}
          <Button label="Retry Slide Content" onPress={retrySlideContent}/>
        </View>)}
    </>);
}
function EmptyPresenter() {
    const state = { status: useValue(slidesState$.status), buildErrors: useValue(slidesState$.buildErrors) };
    return (<View style={styles.empty}>
      {state.status === "building" ? <ActivityIndicator /> : <Text style={styles.emptyTitle}>No deck open</Text>}
      <Text style={styles.emptyBody}>Use File → Open… or press ⌘O.</Text>
      {state.buildErrors.map((message) => <Text key={message} style={styles.errorText}>{message}</Text>)}
    </View>);
}
const styles = StyleSheet.create({
    button: { backgroundColor: "#30323a", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
    buttonText: { color: "#f4f4f5", fontSize: 13, fontWeight: "600" },
    compilingOverlay: { position: "absolute", bottom: 14, right: 14, zIndex: 1, backgroundColor: "#272c3b", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
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
    notesSection: {
        overflow: "hidden",
        minHeight: 0
    },
    presenter: { flex: 1, padding: 14 },
    pressed: { opacity: 0.75 },
    horizontalResizeHandle: { height: "100%", width: 14 },
    horizontalResizeLine: { height: "100%", width: StyleSheet.hairlineWidth },
    preview: { flex: 1, overflow: "hidden" },
    previews: {
        flexDirection: "row",
        minHeight: 0
    },
    previewSection: {
        minWidth: 0
    },
    resizeHandle: { alignItems: "center", justifyContent: "center" },
    root: { backgroundColor: "#171819", flex: 1 },
    statusMessage: { color: "#a1a1aa", fontSize: 12 },
    updateBanner: { alignItems: "center", backgroundColor: "#272c3b", borderRadius: 8, flexDirection: "row", justifyContent: "space-between", marginTop: 12, padding: 10 },
    verticalResizeHandle: { height: 14, width: "100%" },
    verticalResizeLine: { height: StyleSheet.hairlineWidth, width: "100%" },
    workspace: {
        flex: 1,
        minHeight: 0
    },
});
