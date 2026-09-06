import { useCallback, useEffect, useRef, useState } from "react";
import {
  EnrichedMarkdownText,
  EnrichedMarkdownTextInput,
  type EnrichedMarkdownTextInputInstance,
  type MarkdownStyle,
  type MarkdownTextInputStyle,
} from "react-native-enriched-markdown";
import { Pressable, StyleSheet, Text } from "react-native";

export const editableMarkdownSaveDebounceMs = 1000;

const viewerMarkdownStyle: MarkdownStyle = {
  code: { backgroundColor: "#27272a", color: "#e4e4e7", fontFamily: "Menlo", fontSize: 15 },
  codeBlock: {
    backgroundColor: "#111114",
    borderRadius: 6,
    color: "#e4e4e7",
    fontFamily: "Menlo",
    fontSize: 14,
    lineHeight: 21,
    padding: 10,
  },
  em: { color: "#e4e4e7" },
  h1: { color: "#fafafa", fontSize: 22, fontWeight: "700", lineHeight: 28, marginBottom: 6 },
  h2: { color: "#fafafa", fontSize: 20, fontWeight: "700", lineHeight: 26, marginBottom: 6 },
  h3: { color: "#f4f4f5", fontSize: 18, fontWeight: "700", lineHeight: 24, marginBottom: 4 },
  link: { color: "#93c5fd", underline: true },
  list: { color: "#e4e4e7", fontSize: 17, gapWidth: 8, lineHeight: 25, markerColor: "#a1a1aa" },
  paragraph: { color: "#e4e4e7", fontSize: 17, lineHeight: 25, marginBottom: 5 },
  strong: { color: "#fafafa" },
};

const editorMarkdownStyle: MarkdownTextInputStyle = {
  em: { color: "#e4e4e7" },
  link: { color: "#93c5fd", underline: true },
  strong: { color: "#fafafa" },
};

type EditableMarkdownProps = {
  editable: boolean;
  markdown: string;
  onEditingChange?(editing: boolean): void;
  onSave(markdown: string): Promise<void>;
  placeholder: string;
};

export function EditableMarkdown({ editable, markdown, onEditingChange, onSave, placeholder }: EditableMarkdownProps) {
  const inputRef = useRef<EnrichedMarkdownTextInputInstance | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveQueueRef = useRef(Promise.resolve());
  const savedMarkdownRef = useRef(markdown.trim());
  const draftMarkdownRef = useRef(markdown.trim());
  const editingRef = useRef(false);
  const onEditingChangeRef = useRef(onEditingChange);
  const onSaveRef = useRef(onSave);
  const [editorInitialValue, setEditorInitialValue] = useState<string | null>(null);
  const editing = editorInitialValue !== null;

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
    editingRef.current = false;
    setEditorInitialValue(null);
    onEditingChangeRef.current?.(false);
    const input = inputRef.current;
    if (!input) {
      flushDraft();
      return;
    }
    void input.getMarkdown()
      .then((value) => {
        draftMarkdownRef.current = value;
      })
      .catch(() => {})
      .finally(flushDraft);
  }, [flushDraft]);

  const startEditing = useCallback(() => {
    if (!editable || editingRef.current) {
      return;
    }
    draftMarkdownRef.current = markdown.trim();
    savedMarkdownRef.current = markdown.trim();
    editingRef.current = true;
    setEditorInitialValue(draftMarkdownRef.current);
    onEditingChangeRef.current?.(true);
  }, [editable, markdown]);

  useEffect(() => {
    if (!editingRef.current) {
      const normalized = markdown.trim();
      draftMarkdownRef.current = normalized;
      savedMarkdownRef.current = normalized;
    }
  }, [markdown]);

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

  if (editing) {
    return (
      <EnrichedMarkdownTextInput
        ref={inputRef}
        autoFocus
        cursorColor="#93c5fd"
        defaultValue={editorInitialValue}
        markdownStyle={editorMarkdownStyle}
        multiline
        onBlur={finishEditing}
        onChangeMarkdown={(value) => {
          draftMarkdownRef.current = value;
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          saveTimeoutRef.current = setTimeout(flushDraft, editableMarkdownSaveDebounceMs);
        }}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        scrollEnabled={false}
        selectionColor="#3b82f680"
        style={styles.editor}
      />
    );
  }

  return (
    <Pressable
      accessibilityLabel={editable ? "Edit speaker notes" : "Speaker notes"}
      accessibilityRole={editable ? "button" : undefined}
      disabled={!editable}
      onPress={startEditing}
      style={styles.viewerShell}
    >
      {markdown.trim() ? (
        <EnrichedMarkdownText
          allowTrailingMargin={false}
          containerStyle={styles.viewer}
          flavor="github"
          markdown={markdown}
          markdownStyle={viewerMarkdownStyle}
          selectable={!editable}
        />
      ) : (
        <Text style={styles.placeholder}>{placeholder}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editor: {
    backgroundColor: "transparent",
    color: "#e4e4e7",
    fontSize: 17,
    lineHeight: 25,
    minHeight: 120,
    padding: 0,
    width: "100%",
  },
  placeholder: { color: "#71717a", fontSize: 17, fontStyle: "italic", lineHeight: 25 },
  viewer: { width: "100%" },
  viewerShell: { flex: 1, minHeight: 44, width: "100%" },
});
