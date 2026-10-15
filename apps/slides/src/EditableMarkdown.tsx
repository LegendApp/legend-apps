import { notesLayout, type NoteParagraph, type NoteRegion } from "./notesLayout";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { SpeakerNotesConflictError } from "@legend-apps/presentation";
import type { NotesDrafts } from "./notesDrafts";
import { speakerNotesEditorMarkdown, splitSpeakerNoteSteps } from "./speakerNoteSteps";
import { defaultPresenterTextColor, defaultPresenterInactiveColor } from "./presenterAppearance";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import { Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";

export const editableMarkdownSaveDebounceMs = 1000;
const notesLineHeightRatio = 1.4;

const viewerMarkdownStyle: MarkdownStyle = {
  code: { backgroundColor: "#27272a", color: "#d1d5db", fontFamily: "Menlo", fontSize: 15 },
  codeBlock: {
    backgroundColor: "#111114",
    borderRadius: 6,
    color: "#d1d5db",
    fontFamily: "Menlo",
    fontSize: 14,
    lineHeight: 21,
    padding: 10,
  },
  em: { color: "#d1d5db" },
  h1: { color: "#d1d5db", fontSize: 22, fontWeight: "700", lineHeight: 28, marginBottom: 6 },
  h2: { color: "#d1d5db", fontSize: 20, fontWeight: "700", lineHeight: 26, marginBottom: 6 },
  h3: { color: "#d1d5db", fontSize: 18, fontWeight: "700", lineHeight: 24, marginBottom: 4 },
  link: { color: "#93c5fd", underline: true },
  list: { color: "#d1d5db", fontSize: 17, gapWidth: 8, lineHeight: 17 * notesLineHeightRatio, markerColor: "#a1a1aa" },
  paragraph: { color: "#d1d5db", fontSize: 17, lineHeight: 17 * notesLineHeightRatio, marginBottom: 5 },
  strong: { color: "#d1d5db" },
};

function createNotesMarkdownStyle(fontSize: number, color: string): MarkdownStyle {
  const scale = fontSize / 17;
  const style: MarkdownStyle = Object.fromEntries(Object.entries(viewerMarkdownStyle).map(([key, value]) => [key, { ...value, color }]));
  style.list = { ...style.list, markerColor: color };
  for (const key of ["paragraph", "list", "h1", "h2", "h3", "code", "codeBlock"] as const) {
    const base = viewerMarkdownStyle[key]!;
    style[key] = {
      ...style[key],
      fontSize: base.fontSize! * scale,
      lineHeight: base.fontSize! * scale * notesLineHeightRatio,
    };
  }
  // Presenter notes use a fixed dark surface, independent of system appearance.
  const sharedStyle = getLegendDisplayTheme("dark").markdownStyle;
  style.link = sharedStyle.link;
  style.linkVariants = sharedStyle.linkVariants;
  return style;
}

type NotesDismiss = { current: (() => void) | null };
const NotesDismissContext = createContext<NotesDismiss | null>(null);

/** Observe outside clicks without taking the responder from buttons or previews. */
export function NotesEditingBoundary({ children, ...props }: ViewProps) {
  const dismiss = useRef<(() => void) | null>(null);
  return <NotesDismissContext.Provider value={dismiss}>
    <View {...props} onTouchStart={() => dismiss.current?.()}>{children}</View>
  </NotesDismissContext.Provider>;
}

type EditableMarkdownProps = {
  editable: boolean;
  draftKey?: string;
  drafts?: NotesDrafts;
  currentStep?: number;
  onSectionsLayout?(regions: NoteRegion[]): void;
  fontSize?: number;
  backgroundColor?: string;
  textColor?: string;
  inactiveColor?: string;
  markdown: string;
  onEditingChange?(editing: boolean): void;
  onSave(markdown: string, expectedNotes: string | undefined): Promise<void>;
  placeholder: string;
};

export function EditableMarkdown({ draftKey, drafts, editable, currentStep = 0, markdown, onEditingChange, onSave, placeholder, onSectionsLayout, fontSize = 17, backgroundColor = "#171819", textColor = defaultPresenterTextColor, inactiveColor = defaultPresenterInactiveColor }: EditableMarkdownProps) {
  const activeMarkdownStyle = useMemo(() => createNotesMarkdownStyle(fontSize, textColor), [fontSize, textColor]);
  const inactiveMarkdownStyle = useMemo(() => createNotesMarkdownStyle(fontSize, inactiveColor), [fontSize, inactiveColor]);
  // Keep native text and Markdown paragraph metrics identical in both modes.
  const textStyle = { fontSize, lineHeight: fontSize * notesLineHeightRatio };
  const dismiss = useContext(NotesDismissContext);
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());
  const savedMarkdownRef = useRef(markdown.trim());
  const draftMarkdownRef = useRef(draftKey && drafts ? drafts.get(draftKey, markdown.trim()) : markdown.trim());
  const editingRef = useRef(false);
  const onEditingChangeRef = useRef(onEditingChange);
  const onSaveRef = useRef(onSave);
  const [editing, setEditing] = useState(false);
  const [document, setDocument] = useState(draftMarkdownRef.current);
  const [regions, setRegions] = useState<NoteRegion[]>([]);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const saveErrorRef = useRef<Error | null>(null);
  const [resolving, setResolving] = useState(false);
  const resolvingRef = useRef(false);
  const reportSaveError = useCallback((error: unknown) => {
    const next = error instanceof Error ? error : new Error(String(error));
    saveErrorRef.current = next;
    setSaveError(next);
  }, []);
  const sections = useMemo(() => splitSpeakerNoteSteps(document), [document]);
  const hasInactiveNotes = !editing && sections.some(section => section.step !== undefined && section.step !== currentStep);
  const markdownStyle = hasInactiveNotes ? inactiveMarkdownStyle : activeMarkdownStyle;
  const readingColor = hasInactiveNotes ? inactiveColor : textColor;
  const propMarkdownRef = useRef(markdown);

  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  }, [onEditingChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (draftKey && drafts) drafts.bind(draftKey, async (text, base) => {
      try {
        await onSaveRef.current(text, base);
        savedMarkdownRef.current = text;
        saveErrorRef.current = null;
        setSaveError(null);
      } catch (error) {
        reportSaveError(error);
        throw error;
      }
    });
    if (draftKey && drafts) void drafts.flush(draftKey);
  }, [draftKey, drafts, reportSaveError]);

  const enqueueSave = useCallback((nextMarkdown: string) => {
    if (saveErrorRef.current || resolvingRef.current) return;
    const normalized = nextMarkdown.trim();
    if (draftKey && drafts) {
      // Recovery owns pending writes after this component unmounts.
      if (normalized !== savedMarkdownRef.current) drafts.update(draftKey, normalized, savedMarkdownRef.current);
      void drafts.flush(draftKey);
      return;
    }
    if (normalized === savedMarkdownRef.current) {
      return;
    }
    const save = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (normalized === savedMarkdownRef.current) {
          return;
        }
        await onSaveRef.current(normalized, savedMarkdownRef.current);
        savedMarkdownRef.current = normalized;
      });
    saveQueueRef.current = save;
    void save.catch(reportSaveError);
  }, [draftKey, drafts, reportSaveError]);

  const flushDraft = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = undefined;
    }
    enqueueSave(draftMarkdownRef.current);
  }, [enqueueSave]);

  const finishEditing = useCallback(() => {
    if (!editingRef.current) {
      return;
    }
    // onChangeMarkdown already owns the latest draft. Do not wait for a
    // native getMarkdown response while unmounting that same native view:
    // the response can be lost, leaving the final edit unsaved.
    flushDraft();
    editingRef.current = false;
    setEditing(false);
    onEditingChangeRef.current?.(false);
  }, [flushDraft]);

  useEffect(() => {
    if (!editing || !dismiss) return;
    const blur = () => {
      inputRef.current?.blur();
      finishEditing();
    };
    dismiss.current = blur;
    return () => { if (dismiss.current === blur) dismiss.current = null; };
  }, [dismiss, editing, finishEditing]);

  const startEditing = useCallback(() => {
    if (!editable || editingRef.current) {
      return;
    }
    editingRef.current = true;
    setEditing(true);
    onEditingChangeRef.current?.(true);
  }, [editable]);

  const resolveConflict = async (useSaved: boolean) => {
    if (!(saveError instanceof SpeakerNotesConflictError) || resolvingRef.current) return;
    const saved = saveError.savedNotes;
    inputRef.current?.blur();
    finishEditing();
    resolvingRef.current = true;
    setResolving(true);
    try {
      if (draftKey && drafts) {
        if (!await drafts.resolve(draftKey, saved, useSaved ? saved : undefined)) return;
      } else {
        await saveQueueRef.current.catch(() => {});
        await onSaveRef.current(useSaved ? saved : draftMarkdownRef.current.trim(), saved);
      }
      if (useSaved) {
        draftMarkdownRef.current = savedMarkdownRef.current = saved;
        setDocument(saved);
      } else savedMarkdownRef.current = draftMarkdownRef.current.trim();
      saveErrorRef.current = null;
      setSaveError(null);
    } catch (error) { reportSaveError(error); }
    finally { resolvingRef.current = false; setResolving(false); }
  };

  useEffect(() => {
    if (propMarkdownRef.current === markdown) return;
    // Save acknowledgements must not replace a newer local edit or its selection.
    if (editingRef.current || draftMarkdownRef.current !== savedMarkdownRef.current) return;
    propMarkdownRef.current = markdown;
    const normalized = markdown.trim();
    draftMarkdownRef.current = savedMarkdownRef.current = normalized;
    setDocument(normalized);
  }, [markdown, editing]);

  useEffect(() => {
    if (!editable && editingRef.current) {
      inputRef.current?.blur();
      finishEditing();
    }
  }, [editable, finishEditing]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (draftMarkdownRef.current !== savedMarkdownRef.current) {
      enqueueSave(draftMarkdownRef.current);
    }
    if (editingRef.current) {
      onEditingChangeRef.current?.(false);
    }
  }, [enqueueSave]);

  return (
    <View accessibilityLabel={editable ? "Edit speaker notes" : "Speaker notes"}
      onTouchStart={event => event.stopPropagation()}
      style={[styles.viewerShell, editing && styles.focusedShell]}>
      {saveError && <View className="mb-3 gap-3 rounded-lg border border-amber-700 bg-zinc-900 p-3">
        <Text className="font-semibold text-amber-300">Speaker notes not saved</Text>
        <Text className="text-zinc-200">{saveError.message} Autosave is paused. Your draft is kept below.</Text>
        {saveError instanceof SpeakerNotesConflictError && <>
          <Text className="font-semibold text-zinc-300">Saved notes in the deck file</Text>
          <Text selectable className="text-zinc-200">{saveError.savedNotes || "(No saved notes)"}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable accessibilityRole="button" accessibilityLabel="Use saved notes" disabled={resolving}
              className="rounded-md bg-zinc-700 px-3 py-2" onPress={() => { void resolveConflict(true); }}>
              <Text className="text-white">Use saved notes</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Replace saved notes with my draft" disabled={resolving}
              className="rounded-md bg-amber-800 px-3 py-2" onPress={() => { void resolveConflict(false); }}>
              <Text className="text-white">Replace saved notes with my draft</Text>
            </Pressable>
          </View>
        </>}
        <Pressable accessibilityRole="button" accessibilityLabel="Retry saving speaker notes" disabled={resolving}
          onPress={() => { saveErrorRef.current = null; setSaveError(null); flushDraft(); }}>
          <Text className="text-blue-300">Retry save / refresh conflict</Text>
        </Pressable>
        <Text className="font-semibold text-zinc-300">Your draft</Text>
      </View>}
      <View style={{ position: "relative" }}>
        <NotesText markdown={document} editable={editable && !resolving} markdownStyle={markdownStyle}
          placeholder={placeholder} textStyle={{ ...textStyle, color: readingColor }}
          onFocus={input => { inputRef.current = input; startEditing(); }} onBlur={finishEditing}
          onLayout={paragraphs => {
            const next = notesLayout(paragraphs);
            setRegions(next);
            onSectionsLayout?.(next);
          }}
          onChange={value => {
            setDocument(value);
            draftMarkdownRef.current = value;
            if (draftKey && drafts) drafts.update(draftKey, value, savedMarkdownRef.current);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(flushDraft, editableMarkdownSaveDebounceMs);
          }} />
        {/* Clip read-only foregrounds to active regions while preserving the editable native view. */}
        {hasInactiveNotes && regions.map((region, index) => region.step === undefined || region.step === currentStep
          ? <View key={index} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{ position: "absolute", left: 0, right: 0, top: region.y, height: region.height, overflow: "hidden", backgroundColor }}>
              <View style={{ position: "absolute", top: -region.y, left: 0, right: 0 }}>
                <EnrichedMarkdownTextInput key={document} accessible={false} defaultValue={speakerNotesEditorMarkdown(document)} editable={false}
                  markdownShortcuts markdownStyle={activeMarkdownStyle} multiline scrollEnabled={false}
                  style={{ ...styles.editor, ...textStyle, color: textColor, minHeight: 0 }} />
              </View>
            </View>
          : null)}
      </View>
    </View>
  );
}

/** Keep the native text view and layout alive across focus; AppKit owns click-to-caret hit testing. */
function NotesText({ markdown, editable, markdownStyle, placeholder, textStyle, onFocus, onBlur, onChange, onLayout }: {
  markdown: string; editable: boolean; markdownStyle: MarkdownStyle; placeholder: string;
  textStyle: { fontSize: number; lineHeight: number; color: string };
  onFocus(input: EnrichedMarkdownTextInputInstance | null): void;
  onBlur(): void; onChange(markdown: string): void;
  onLayout(paragraphs: NoteParagraph[]): void;
}) {
  const input = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const [width, setWidth] = useState(0);
  const layoutCallback = useRef(onLayout);
  layoutCallback.current = onLayout;
  const value = speakerNotesEditorMarkdown(markdown);
  const lastValue = useRef(value);
  const focused = useRef(false);
  const [finishedEdit, setFinishedEdit] = useState(0);
  useLayoutEffect(() => {
    // Add markers for newly typed/pasted labels only after editing finishes.
    // Replacing native text during typing would disturb selection and undo.
    if (!focused.current && lastValue.current !== value) {
      lastValue.current = value;
      input.current?.setValue(value);
    }
  }, [value, finishedEdit]);
  useEffect(() => {
    if (width <= 0) return;
    let cancelled = false;
    void input.current?.getParagraphLayouts().then(paragraphs => {
      if (!cancelled) layoutCallback.current(paragraphs);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [value, width, textStyle.fontSize, finishedEdit]);
  return <EnrichedMarkdownTextInput ref={input}
    onLayout={event => setWidth(event.nativeEvent.layout.width)} defaultValue={value} editable={editable}
    markdownShortcuts markdownStyle={markdownStyle} multiline scrollEnabled={false}
    cursorColor="#93c5fd" selectionColor="#3b82f680"
    placeholder={placeholder} placeholderTextColor="#71717a"
    onFocus={() => { focused.current = editable; onFocus(input.current); }}
    onBlur={() => {
      focused.current = false;
      setFinishedEdit(version => version + 1);
      onBlur();
    }}
    onChangeMarkdown={next => {
      const markdown = speakerNotesEditorMarkdown(next, true);
      lastValue.current = next;
      onChange(markdown);
    }}
    style={{ ...styles.editor, ...textStyle, minHeight: 0 }} />;
}

const styles = StyleSheet.create({
  editor: {
    backgroundColor: "transparent",
    fontSize: 17,
    minHeight: 120,
    padding: 0,
    width: "100%",
  },
  viewerShell: { flex: 1, minHeight: 44, width: "100%", borderWidth: 2, borderColor: "transparent", borderRadius: 6, padding: 8 },
  focusedShell: { borderColor: "#3b82f6" },
});
