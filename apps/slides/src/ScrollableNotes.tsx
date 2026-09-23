import { useCallback, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ScrollView, View } from "react-native";
import { EditableMarkdown } from "./EditableMarkdown";

type Props = ComponentProps<typeof EditableMarkdown> & { notesWidth: number };

/** One scroll owner per mode: native text editing, or step-following reading. */
export function ScrollableNotes({ notesWidth, onEditingChange, ...props }: Props) {
  const scroll = useRef<ScrollView>(null);
  const sections = useRef(new Map<number, { y: number; height: number }>());
  const contentHeight = useRef(0);
  const [height, setHeight] = useState(0);
  const [editing, setEditing] = useState(false);
  const step = props.currentStep ?? 0;
  const padding = 14;
  const follow = useCallback(() => {
    const section = sections.current.get(step);
    if (!editing && section && height > 0) {
      scroll.current?.scrollTo({ y: Math.max(0, Math.min(contentHeight.current - height, padding + 10 + section.y + Math.min(section.height, height) / 2 - height / 2)), animated: false });
    }
  }, [step, editing, height, padding]);
  // Imperative native scrolling on navigation/layout, never a JS animation loop.
  useLayoutEffect(follow, [follow]);
  return <View style={{ flex: 1, minHeight: 0 }} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    <ScrollView ref={scroll} scrollEnabled={!editing} style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: padding }}
      onContentSizeChange={(_width, nextHeight) => { contentHeight.current = nextHeight; follow(); }}>
      <View style={{ width: "100%", maxWidth: notesWidth, alignSelf: "center" }}>
        <EditableMarkdown {...props} editorHeight={Math.max(44, height - 48)}
          onEditingChange={value => {
            setEditing(value);
            if (value) scroll.current?.scrollTo({ y: 0, animated: false });
            onEditingChange?.(value);
          }}
          onSectionLayout={(sectionStep, y, sectionHeight) => {
            sections.current.set(sectionStep, { y, height: sectionHeight });
            if (sectionStep === step) follow();
          }} />
      </View>
    </ScrollView>
  </View>;
}
