import { useValue } from "@legendapp/state/react";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SlideCanvas, DeckRenderer } from "./DeckRenderer";
import { slidesState$ } from "./slidesStore";
import { ScrollableNotes } from "./ScrollableNotes";
import { notesPreviewRatioSetting, useNotesPreviewRatioSetting, usePresentationNotesWidthSetting, usePresentationNotesFontSizeSetting } from "./slidesSettings";
import { notesOutput$ } from "./notesOutput";
import { formatPresenterElapsed } from "./presenterToolbar";
import { createPresenterResizeResponder } from "./presenterResizeResponder";

const noSave = async () => {};
function NotesClock() {
  const elapsed = useValue(notesOutput$.elapsed);
  return <Text style={{ color: "#e4e4e7", fontSize: 18, fontVariant: ["tabular-nums"] }}>{formatPresenterElapsed(elapsed)}</Text>;
}

export function NotesWindow() {
  const index = useValue(slidesState$.currentSlide);
  const step = useValue(slidesState$.currentStep);
  const blackout = useValue(slidesState$.blackout);
  const notes = useValue(() => slidesState$.slides[index]?.notes.get() ?? "");
  const width = usePresentationNotesWidthSetting();
  const fontSize = usePresentationNotesFontSizeSetting();
  const ratio = useNotesPreviewRatioSetting();
  const [height, setHeight] = useState(800);
  const [responder] = useState(() => createPresenterResizeResponder({ direction: "vertical", onResize: () => {}, onResizeEnd: () => {} }));
  useEffect(() => { responder.updateCallbacks({ direction: "vertical", onResize: delta => notesPreviewRatioSetting.set(notesPreviewRatioSetting.get() + delta / height), onResizeEnd: () => {} }); }, [height, responder]);
  return <View style={{ flex: 1, backgroundColor: "#111114" }} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    <View style={{ padding: 12, flexDirection: "row", justifyContent: "space-between" }}>
      <NotesClock />
      <Text style={{ color: "#a1a1aa", fontSize: 18 }}>Slide {index + 1} · Step {step + 1}</Text>
    </View>
    <View style={{ height: height * ratio, marginHorizontal: 20 }}>
      {blackout ? <View style={{ flex: 1, backgroundColor: "black" }} /> : <SlideCanvas targetIndex={index} isPreview backgroundIsPreview><DeckRenderer isPreview targetIndex={index} targetStep={step} /></SlideCanvas>}
    </View>
    <View accessibilityLabel="Resize notes preview" {...responder.panHandlers} style={{ height: 18, alignItems: "center", justifyContent: "center" }}>
      <View style={{ height: 3, width: 60, backgroundColor: "#52525b", borderRadius: 2 }} />
    </View>
    <ScrollableNotes key={index} notesWidth={width} fontSize={fontSize} editable={false}
      markdown={notes} currentStep={step} onSave={noSave} placeholder="No notes for this slide." />
  </View>;
}
export function IdentifyWindow({ number, name }: { number?: number; name?: string }) {
  return <View style={{ flex: 1, backgroundColor: "#111114", alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: "#67e8f9", fontSize: 96, fontWeight: "700" }}>{number}</Text>
    <Text style={{ color: "white", fontSize: 20 }}>{name}</Text>
  </View>;
}
