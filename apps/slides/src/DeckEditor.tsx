import { createDeckEditorAutosave } from "./deckEditorAutosave";
import { presenterEditToolbarItemId } from "./presenterToolbar";
import { prepareDraftExit, prepareSlidesExit, registerSlidesExitPreparation } from "./slidesExit";
import { readTextFile, writeTextFileIfUnchanged } from "@legendapp/spark/dialogs";
import { addKeyDownListener, KeyCodes } from "@legendapp/spark/shortcuts/keyboard";
import { SourceDocumentEditor } from "@legend-apps/source-editor";
import { addWindowToolbarItemSelectedListener, setWindowOptions } from "@legendapp/spark/windows/managed";
import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Text, View } from "react-native";
import { createDeckEditorSession, type DeckEditorSession, type DeckEditorSnapshot } from "./deckEditorSession";
import { invalidateDeckBuild, previewDeckSource, setDraftReloadHandler } from "./deckLoader";
import { DeckRenderer, SlideCanvas } from "./DeckRenderer";
import { slidesState$ } from "./slidesStore";

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

function EditorPreview({ session }: { session: DeckEditorSession }) {
  const index = useEditorSession(session, selectedSlide);
  const hasPreview = useValue(() => slidesState$.compiled.get() !== null);
  return <View className="flex-1 bg-black">
    {hasPreview && <SlideCanvas targetIndex={index} isPreview><DeckRenderer targetIndex={index} isPreview /></SlideCanvas>}
  </View>;
}

function EditorStatus({ session }: { session: DeckEditorSession }) {
  const error = useEditorSession(session, (state) => state.error);
  const building = useEditorSession(session, (state) => state.status === "building");
  const buildErrors = useValue(slidesState$.buildErrors);
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
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const documentVersion = useEditorSession(session, (state) => state.documentVersion);
  const loading = useEditorSession(session, (state) => state.status === "loading" || state.status === "empty");
  useEffect(() => {
    const autosave = createDeckEditorAutosave(session);
    void setWindowOptions("slides-presenter", { windowStyle: { toolbarItems: [{
      id: presenterEditToolbarItemId, type: "segmented", placement: "trailing", selectedValue: "editing",
      segments: [{ label: "Finish Editing", systemImageName: "square.and.pencil", value: "editing" }],
    }] } });
    const toolbar = addWindowToolbarItemSelectedListener(event => {
      if (event.identifier === "slides-presenter" && event.itemId === presenterEditToolbarItemId) {
        void prepareSlidesExit().then(allowed => { if (allowed) exitRef.current(); });
      }
    });
    void session.open(path);
    setDraftReloadHandler(() => session.refresh());
    const unregisterExit = registerSlidesExitPreparation(async () => {
      if (await autosave.flush()) return true;
      return prepareDraftExit(session, () =>
        new Promise<"cancel" | "discard" | "save">((resolve) => {
          Alert.alert("Save deck changes?", "Your draft has not been saved to disk.", [
            { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
            { text: "Discard Changes", style: "destructive", onPress: () => resolve("discard") },
            { text: "Save", onPress: () => resolve("save") },
          ]);
        }),
      );
    });
    const removeKeys = addKeyDownListener((event) => {
      if (event.keyCode === KeyCodes.KEY_S && (event.modifiers & KeyCodes.MODIFIER_COMMAND)) { void autosave.flush(); return true; }
      return false;
    }, { windowIdentifiers: ["slides-presenter"] });
    return () => {
      unregisterExit(); toolbar.remove(); removeKeys(); autosave.dispose(); setDraftReloadHandler(); session.dispose();
    };
  }, [path, session]);
  return <View className="flex-1 bg-zinc-900">
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
