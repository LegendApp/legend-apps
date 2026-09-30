import { saveDeckDraftCopy } from "./deckEditorRecovery";
import { createDeckEditorAutosave } from "./deckEditorAutosave";
import { presenterEditToolbarItemId } from "./presenterToolbar";
import { prepareDraftExit, prepareSlidesExit, registerSlidesExitPreparation } from "./slidesExit";
import { saveFileDialog } from "@legendapp/spark/dialogs";
import { readText, writeTextIfUnchanged, writeText } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { addKeyboardListener, KeyCodes } from "@legendapp/spark/shortcuts/keyboard";
import { SourceDocumentEditor } from "@legend-apps/source-editor";
import { setWindowOptions } from "@legendapp/spark/windows";
import { useValue } from "@legendapp/state/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, Text, View } from "react-native";
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
        if (state.selection < state.slideEnds[middle])
            high = middle;
        else
            low = middle + 1;
    }
    return Math.min(low, Math.max(0, state.slideEnds.length - 1));
}
function SourcePane({ session }: {
    session: DeckEditorSession;
}) {
    // Seed once per document version, never send the full draft back on each edit.
    const [document] = useState(() => session.getSnapshot());
    return <SourceDocumentEditor filePath={document.path!} initialSource={document.source} language="mdx" syntaxHighlightingMode="background" syntaxBackend="tree-sitter" onSelectionChange={({ start }) => session.select(start)} onChange={(edit) => {
            if (document.documentVersion !== session.getSnapshot().documentVersion)
                return;
            session.applyEdit(edit);
        }}/>;
}
function EditorPreview({ session }: {
    session: DeckEditorSession;
}) {
    const index = useEditorSession(session, selectedSlide);
    const hasPreview = useValue(() => slidesState$.compiled.get() !== null);
    return <View className="flex-1 bg-black">
    {hasPreview && <SlideCanvas targetIndex={index} isPreview><DeckRenderer targetIndex={index} isPreview/></SlideCanvas>}
  </View>;
}
function EditorStatus({ session }: {
    session: DeckEditorSession;
}) {
    const error = useEditorSession(session, (state) => state.error);
    const building = useEditorSession(session, (state) => state.status === "building");
    const conflict = useEditorSession(session, state => state.conflict);
    const dirty = useEditorSession(session, state => state.dirty);
    const saving = useEditorSession(session, state => state.saving);
    const saveCopy = async () => {
        try {
            const copied = await saveDeckDraftCopy(session, async () => { const result = await saveFileDialog({
                defaultName: "Recovered Deck.mdx", filters: [{ extensions: ["mdx"] }],
            }); return result.canceled ? null : result.path; }, writeText);
            if (copied)
                Alert.alert("Draft copy saved", "Your original deck is unchanged. You can now reload its disk version.");
        }
        catch (error) {
            Alert.alert("Could not save draft copy", String(error));
        }
    };
    const reload = () => Alert.alert("Reload deck from disk?", "This discards your current source edits. Use Save Copy first if you want to keep them.", [
        { text: "Cancel", style: "cancel" },
        { text: "Discard Edits and Reload", style: "destructive", onPress: () => {
                void session.reloadFromDisk().catch(error => Alert.alert("Could not reload deck", String(error)));
            } },
    ]);
    const buildErrors = useValue(slidesState$.buildErrors);
    return <>
    {(error || buildErrors.length > 0) && <Text className="p-3 text-red-300">{error || buildErrors.join("\n")}</Text>}
    {dirty && (conflict || error) && <View className="flex-row gap-4 px-3 py-2">
      <Pressable accessibilityRole="button" onPress={() => void saveCopy()}><Text className="text-blue-300">Save Copy…</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={saving} onPress={reload}><Text className="text-blue-300">Reload from Disk…</Text></Pressable>
    </View>}
    {building && <Text className="px-3 py-1 text-zinc-400">Updating preview…</Text>}
  </>;
}
export function DeckEditor({ path, onExit }: {
    path: string;
    onExit(): void;
}) {
    const [session] = useState(() => createDeckEditorSession({
        read: readText, write: async (path, expected, contents) => (await writeTextIfUnchanged(path, expected, contents)).written,
        preview: previewDeckSource, invalidate: invalidateDeckBuild, opened() { },
    }));
    const exitRef = useRef(onExit);
    exitRef.current = onExit;
    const documentVersion = useEditorSession(session, (state) => state.documentVersion);
    const loading = useEditorSession(session, (state) => state.status === "loading" || state.status === "empty");
    useEffect(() => {
        const autosave = createDeckEditorAutosave(session);
        void setWindowOptions("slides-presenter", {
            ...{
                macos: {
                    toolbar: {
                        items: [{
                                id: presenterEditToolbarItemId, type: "segmented", placement: "trailing", value: "editing",
                                segments: [{ label: "Finish Editing", symbol: "square.and.pencil", value: "editing" }],
                            }]
                    }
                }
            }
        });
        const toolbar = ownRegistration(addMacOSWindowListener("slides-presenter", event => {
            if (event.type === "toolbarSelectionChanged" && event.itemId === presenterEditToolbarItemId) {
                void prepareSlidesExit().then(allowed => { if (allowed)
                    exitRef.current(); });
            }
        }));
        void session.open(path);
        setDraftReloadHandler(() => session.refresh());
        const unregisterExit = registerSlidesExitPreparation(async () => {
            if (await autosave.flush())
                return true;
            return prepareDraftExit(session, () => new Promise<"cancel" | "discard" | "save">((resolve) => {
                Alert.alert("Save deck changes?", "Your draft has not been saved to disk.", [
                    { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
                    { text: "Discard Changes", style: "destructive", onPress: () => resolve("discard") },
                    { text: "Save", onPress: () => resolve("save") },
                ]);
            }));
        });
        const removeKeys = ownRegistration(addKeyboardListener("down", (event) => {
            if (event.keyCode === KeyCodes.KEY_S && (event.modifiers & KeyCodes.MODIFIER_COMMAND)) {
                void autosave.flush();
                return true;
            }
            return false;
        }, { windowIds: ["slides-presenter"] }));
        return () => {
            unregisterExit();
            void toolbar.remove().catch(console.error);
            void removeKeys.remove().catch(console.error);
            autosave.dispose();
            setDraftReloadHandler();
            session.dispose();
        };
    }, [path, session]);
    return <View className="flex-1 bg-zinc-900">
    <View className="flex-1 flex-row">
      <View className="flex-1 border-r border-zinc-700">
        {!loading ? <SourcePane key={documentVersion} session={session}/>
            : <Text className="p-4 text-zinc-300">Loading source…</Text>}
      </View>
      <EditorPreview session={session}/>
    </View>
    <EditorStatus session={session}/>
  </View>;
}
