import { readTextFile, writeTextFileIfUnchanged } from "@legend-apps/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import { SourceDocumentEditor } from "@legend-apps/source-editor";
import { setWindowOptions } from "@legend-apps/window-manager";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { createDeckEditorSession, type DeckEditorSession, type DeckEditorSnapshot } from "./deckEditorSession";
import { invalidateDeckBuild, previewDeckSource, setDraftReloadHandler } from "./deckLoader";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { useSlidesState } from "./slidesStore";

function useEditorSession<T>(session: DeckEditorSession, select: (state: DeckEditorSnapshot) => T) {
  return useSyncExternalStore(session.subscribe, () => select(session.getSnapshot()), () => select(session.getSnapshot()));
}

function selectedSlide(state: DeckEditorSnapshot) {
  let low = 0, high = state.slideEnds.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (state.selection < state.slideEnds[middle]) high = middle; else low = middle + 1;
  }
  return Math.min(low, Math.max(0, state.slideEnds.length - 1));
}

function SourcePane({ session }: { session: DeckEditorSession }) {
  // Seed once per document version, never send the full draft back on each edit.
  const [document] = useState(() => session.getSnapshot());
  return <SourceDocumentEditor filePath={document.path!} initialSource={document.source}
    language="mdx" syntaxHighlightingMode="background" syntaxBackend="tree-sitter"
    onSelectionChange={({ start }) => session.select(start)}
    onChange={(edit) => {
      if (document.documentVersion !== session.getSnapshot().documentVersion) return;
      session.applyEdit(edit);
    }} />;
}

function EditorToolbar({ session, onExit }: { session: DeckEditorSession; onExit(): void }) {
  const dirty = useEditorSession(session, (state) => state.dirty);
  const saving = useEditorSession(session, (state) => state.saving);
  const index = useEditorSession(session, selectedSlide);
  const leave = () => {
    if (dirty) {
      Alert.alert("Save deck changes?", "Your draft has not been saved to disk.", [
        { text: "Cancel", style: "cancel" },
        { text: "Discard Changes", style: "destructive", onPress: onExit },
        { text: "Save and Close Editor", onPress: () => { void session.save().then((saved) => {
          const latest = session.getSnapshot();
          if (saved && !latest.dirty) onExit();
        }); } },
      ]);
    } else onExit();
  };
  return <View className="flex-row items-center gap-4 border-b border-zinc-700 px-4 py-2">
      <Pressable accessibilityRole="button" onPress={leave}><Text className="text-blue-300">Done Editing</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!dirty || saving} onPress={() => void session.save()}>
        <Text className="text-blue-300">{saving ? "Saving…" : "Save ⌘S"}</Text>
      </Pressable>
      <Text className="text-zinc-400">{dirty ? "Unsaved changes — save before closing the window" : "Saved"} · Slide {index + 1}</Text>
    </View>;
}

function EditorPreview({ session }: { session: DeckEditorSession }) {
  const index = useEditorSession(session, selectedSlide);
  const hasPreview = useSlidesState((value) => value.component !== null);
  return <View className="flex-1 bg-black">
    {hasPreview && <SlideCanvas targetIndex={index} isPreview><DeckRenderer targetIndex={index} isPreview /></SlideCanvas>}
  </View>;
}

function EditorStatus({ session }: { session: DeckEditorSession }) {
  const error = useEditorSession(session, (state) => state.error);
  const building = useEditorSession(session, (state) => state.status === "building");
  const buildErrors = useSlidesState((value) => value.buildErrors);
  return <>
    {(error || buildErrors.length > 0) && <Text className="p-3 text-red-300">{error || buildErrors.join("\n")}</Text>}
    {building && <Text className="px-3 py-1 text-zinc-400">Updating preview…</Text>}
  </>;
}

export function DeckEditor({ path, onExit }: { path: string; onExit(): void }) {
  const [session] = useState(() => createDeckEditorSession({
    read: readTextFile, write: writeTextFileIfUnchanged,
    preview: previewDeckSource, invalidate: invalidateDeckBuild, opened() {},
  }));
  const documentVersion = useEditorSession(session, (state) => state.documentVersion);
  const loading = useEditorSession(session, (state) => state.status === "loading" || state.status === "empty");
  useEffect(() => {
    void setWindowOptions("slides-presenter", { windowStyle: { toolbarItems: [] } });
    void session.open(path);
    setDraftReloadHandler(() => { void session.refresh(); });
    const removeKeys = addKeyDownListener((event) => {
      if (event.keyCode === KeyCodes.KEY_S && (event.modifiers & KeyCodes.MODIFIER_COMMAND)) { void session.save(); return true; }
      return false;
    });
    return () => { removeKeys(); setDraftReloadHandler(); session.dispose(); };
  }, [path, session]);
  return <View className="flex-1 bg-zinc-900">
    <EditorToolbar session={session} onExit={onExit} />
    <View className="flex-1 flex-row">
      <View className="flex-1 border-r border-zinc-700">
        {!loading ? <SourcePane key={documentVersion} session={session} />
          : <Text className="p-4 text-zinc-300">Loading source…</Text>}
      </View>
      <EditorPreview session={session} />
    </View>
    <EditorStatus session={session} />
  </View>;
}
