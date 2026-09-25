import { splitSpeakerNoteSteps, speakerNoteOpacity, speakerNotesEditorMarkdown } from "./speakerNoteSteps";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownStyle,
} from "react-native-enriched-markdown";
import { StyleSheet, View, type ViewProps } from "react-native";

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

function createNotesMarkdownStyle(fontSize: number): MarkdownStyle {
  const scale = fontSize / 17;
  const style = { ...viewerMarkdownStyle };
  for (const key of ["paragraph", "list", "h1", "h2", "h3", "code", "codeBlock"] as const) {
    const base = viewerMarkdownStyle[key]!;
    style[key] = {
      ...base,
      fontSize: base.fontSize! * scale,
      lineHeight: base.fontSize! * scale * notesLineHeightRatio,
    };
  }
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
  currentStep?: number;
  onSectionLayout?(step: number, y: number, height: number): void;
  fontSize?: number;
  markdown: string;
  onEditingChange?(editing: boolean): void;
  onSave(markdown: string): Promise<void>;
  placeholder: string;
};

export function EditableMarkdown({ editable, currentStep = 0, markdown, onEditingChange, onSave, placeholder, onSectionLayout, fontSize = 17 }: EditableMarkdownProps) {
  const markdownStyle = useMemo(() => createNotesMarkdownStyle(fontSize), [fontSize]);
  // Keep native text and Markdown paragraph metrics identical in both modes.
  const textStyle = { fontSize, lineHeight: fontSize * notesLineHeightRatio };
  const sectionGap = fontSize * 27 / 17;
  const dismiss = useContext(NotesDismissContext);
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());
  const savedMarkdownRef = useRef(markdown.trim());
  const draftMarkdownRef = useRef(markdown.trim());
  const editingRef = useRef(false);
  const onEditingChangeRef = useRef(onEditingChange);
  const onSaveRef = useRef(onSave);
  const [editing, setEditing] = useState(false);
  const [sections, setSections] = useState(() => noteSections(markdown));
  const sectionsRef = useRef(sections);
  const propMarkdownRef = useRef(markdown);

  useEffect(() => {
    onEditingChangeRef.current = onEditingChange;
  }, [onEditingChange]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const enqueueSave = useCallback((nextMarkdown: string) => {
    const normalized = nextMarkdown.trim();
    if (normalized === savedMarkdownRef.current) {
      return;
    }
    const save = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (normalized === savedMarkdownRef.current) {
          return;
        }
        await onSaveRef.current(normalized);
        savedMarkdownRef.current = normalized;
      });
    saveQueueRef.current = save;
    void save.catch(() => {});
  }, []);

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

  useEffect(() => {
    if (propMarkdownRef.current === markdown) return;
    // Save acknowledgements must not replace a newer local edit or its selection.
    if (editingRef.current || draftMarkdownRef.current !== savedMarkdownRef.current) return;
    propMarkdownRef.current = markdown;
    const normalized = markdown.trim();
    draftMarkdownRef.current = savedMarkdownRef.current = normalized;
    sectionsRef.current = noteSections(markdown);
    setSections(sectionsRef.current);
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
      {sections.map((section, index) => (
        <View key={index} onLayout={event => {
          if (section.step !== undefined) onSectionLayout?.(section.step, event.nativeEvent.layout.y, event.nativeEvent.layout.height);
        }} style={[styles.noteSection, { opacity: editing ? 1 : speakerNoteOpacity(section, currentStep), marginTop: index > 0 ? sectionGap : 0 }]}>
          <NotesText markdown={section.markdown} editable={editable} markdownStyle={markdownStyle}
            placeholder={sections.length === 1 ? placeholder : ""} textStyle={textStyle}
            onFocus={input => { inputRef.current = input; startEditing(); }}
            onBlur={finishEditing}
            onChange={value => {
              sectionsRef.current = sectionsRef.current.map((item, i) => i === index ? { ...item, markdown: value } : item);
              setSections(sectionsRef.current);
              draftMarkdownRef.current = sectionsRef.current.map(item => item.separator + item.markdown).join("");
              if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
              saveTimeoutRef.current = setTimeout(flushDraft, editableMarkdownSaveDebounceMs);
            }} />
        </View>
      ))}
    </View>
  );
}

function noteSections(markdown: string) {
  const source = markdown.trim().replace(/\r\n/g, "\n");
  let end = 0;
  const sections = splitSpeakerNoteSteps(source).map(section => {
    const start = source.indexOf(section.markdown, end);
    const separator = source.slice(end, start);
    end = start + section.markdown.length;
    return { ...section, separator };
  });
  return sections.length ? sections : [{ markdown: "", step: undefined, separator: "" }];
}

/** Keep the native text view and layout alive across focus; AppKit owns click-to-caret hit testing. */
function NotesText({ markdown, editable, markdownStyle, placeholder, textStyle, onFocus, onBlur, onChange }: {
  markdown: string; editable: boolean; markdownStyle: MarkdownStyle; placeholder: string;
  textStyle: { fontSize: number; lineHeight: number };
  onFocus(input: EnrichedMarkdownTextInputInstance | null): void;
  onBlur(): void; onChange(markdown: string): void;
}) {
  const input = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const value = speakerNotesEditorMarkdown(markdown);
  const lastValue = useRef(value);
  useLayoutEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      input.current?.setValue(value);
    }
  }, [value]);
  return <EnrichedMarkdownTextInput ref={input} defaultValue={value} editable={editable}
    markdownStyle={markdownStyle} multiline scrollEnabled={false}
    cursorColor="#93c5fd" selectionColor="#3b82f680"
    placeholder={placeholder} placeholderTextColor="#71717a"
    onFocus={() => onFocus(input.current)} onBlur={onBlur}
    onChangeMarkdown={next => {
      const markdown = speakerNotesEditorMarkdown(next, true);
      lastValue.current = speakerNotesEditorMarkdown(markdown);
      onChange(markdown);
    }}
    style={{ ...styles.editor, ...textStyle, minHeight: 0 }} />;
}

const styles = StyleSheet.create({
  editor: {
    backgroundColor: "transparent",
    color: "#d1d5db",
    fontSize: 17,
    minHeight: 120,
    padding: 0,
    width: "100%",
  },
  noteSection: { width: "100%" },
  viewerShell: { flex: 1, minHeight: 44, width: "100%", borderWidth: 2, borderColor: "transparent", borderRadius: 6, padding: 8 },
  focusedShell: { borderColor: "#3b82f6" },
});
