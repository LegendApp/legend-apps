import { readTextFile, writeTextFileIfUnchanged } from "@legend-apps/file-dialog";
import { addKeyDownListener, KeyCodes } from "@legend-apps/keyboard-manager";
import { getDeckSourceStructure } from "@legend-apps/presentation";
import { SourceDocumentEditor } from "@legend-apps/source-editor";
import { setWindowOptions } from "@legend-apps/window-manager";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { createDeckEditorSession, type DeckEditorSession } from "./deckEditorSession";
import { invalidateDeckBuild, previewDeckSource, setDraftReloadHandler } from "./deckLoader";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { useSlidesState } from "./slidesStore";

function useEditorSession(session: DeckEditorSession) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

function slideEnds(source: string) {
  try { return getDeckSourceStructure(source).slides.map((slide) => slide.end); }
  catch { return []; }
}

function SourcePane({ session }: { session: DeckEditorSession }) {
  // Seed once per document version, never send the full draft back on each edit.
  const [document] = useState(() => session.getSnapshot());
  return <SourceDocumentEditor filePath={document.path!} initialSource={document.source}
    language="mdx" syntaxHighlightingMode="background"
    onSelectionChange={({ start }) => session.select(start)}
    onChange={(edit) => {
      if (document.documentVersion !== session.getSnapshot().documentVersion) return;
      const source = session.getSnapshot().source;
      session.edit(source.slice(0, edit.offset) + edit.insertedText + source.slice(edit.offset + edit.removedLength), edit.revision);
    }} />;
}

export function DeckEditor({ path, onExit }: { path: string; onExit(): void }) {
  const [session] = useState(() => createDeckEditorSession({
    read: readTextFile, write: writeTextFileIfUnchanged,
    preview: previewDeckSource, invalidate: invalidateDeckBuild, opened() {},
  }));
  const state = useEditorSession(session);
  const buildErrors = useSlidesState((value) => value.buildErrors);
  const hasPreview = useSlidesState((value) => value.component !== null);
  const ends = slideEnds(state.source);
  const selectedIndex = ends.findIndex((end) => state.selection < end);
  const index = selectedIndex < 0 ? Math.max(0, ends.length - 1) : selectedIndex;
  const dirty = state.source !== state.savedSource;
  useEffect(() => {
    void setWindowOptions("slides-presenter", { windowStyle: { toolbarItems: [] } });
    void session.open(path);
    setDraftReloadHandler(() => { void session.refresh(); });
    const removeKeys = addKeyDownListener((event) => {
      if (event.keyCode === KeyCodes.KEY_S && (event.modifiers & KeyCodes.MODIFIER_COMMAND)) {
        void session.save(); return true;
      }
      return false;
    });
    return () => { removeKeys(); setDraftReloadHandler(); session.dispose(); };
  }, [path, session]);
  const leave = () => {
    if (dirty) {
      Alert.alert("Save deck changes?", "Your draft has not been saved to disk.", [
        { text: "Cancel", style: "cancel" },
        { text: "Discard Changes", style: "destructive", onPress: onExit },
        { text: "Save and Close Editor", onPress: () => { void session.save().then((saved) => {
          const latest = session.getSnapshot();
          if (saved && latest.source === latest.savedSource) onExit();
        }); } },
      ]);
    } else onExit();
  };
  return <View className="flex-1 bg-zinc-900">
    <View className="flex-row items-center gap-4 border-b border-zinc-700 px-4 py-2">
      <Pressable accessibilityRole="button" onPress={leave}><Text className="text-blue-300">Done Editing</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!dirty || state.saving} onPress={() => void session.save()}>
        <Text className="text-blue-300">{state.saving ? "Saving…" : "Save ⌘S"}</Text>
      </Pressable>
      <Text className="text-zinc-400">{dirty ? "Unsaved changes — save before closing the window" : "Saved"} · Slide {index + 1}</Text>
    </View>
    <View className="flex-1 flex-row">
      <View className="flex-1 border-r border-zinc-700">
        {state.status !== "loading" && state.status !== "empty"
          ? <SourcePane key={state.documentVersion} session={session} />
          : <Text className="p-4 text-zinc-300">{state.status === "loading" ? "Loading source…" : state.error}</Text>}
      </View>
      <View className="flex-1 bg-black">
        {hasPreview && <SlideCanvas targetIndex={index} isPreview><DeckRenderer targetIndex={index} isPreview /></SlideCanvas>}
      </View>
    </View>
    {(state.error || buildErrors.length > 0) && <Text className="p-3 text-red-300">{state.error || buildErrors.join("\n")}</Text>}
    {state.status === "building" && <Text className="px-3 py-1 text-zinc-400">Updating preview…</Text>}
  </View>;
}
