import { TextInputSearch, type TextInputSearchRef } from "@legend-apps/text-input-search";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { ExampleButton, ExamplePanel, styles } from "./shared";

export function TextInputSearchExample() {
  const inputRef = useRef<TextInputSearchRef>(null);
  const [value, setValue] = useState("");

  return (
    <ExamplePanel title="Text Input Search">
      <Text style={styles.bodyText}>Native search field value: {value || "empty"}</Text>
      <TextInputSearch
        defaultValue=""
        onChangeText={setValue}
        placeholder="Search library"
        style={styles.searchInput}
      />
      <ExampleButton onPress={() => inputRef.current?.focus()}>Focus Search</ExampleButton>
      <TextInputSearch
        ref={inputRef}
        onChangeText={(text) => setValue(`focused: ${text}`)}
        placeholder="Focusable search field"
        style={styles.searchInput}
      />
    </ExamplePanel>
  );
}
