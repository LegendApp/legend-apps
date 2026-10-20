import { useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { createMermaidDocument } from "./mermaidDocument";

type MarkdownMermaidProps = {
  source: string;
  onError: (error: string) => void;
};

export function MarkdownMermaid({ source, onError }: MarkdownMermaidProps) {
  const dark = useColorScheme() === "dark";
  const [height, setHeight] = useState(160);
  const document = useMemo(() => ({ html: createMermaidDocument(source, dark) }), [source, dark]);

  return (
    <WebView
      source={document}
      containerStyle={{ height, flex: 0 }}
      containerStyle={{ height, flex: 0 }}
      style={{ backgroundColor: "transparent" }}
      scrollEnabled={false}
      originWhitelist={["about:*"]}
      onShouldStartLoadWithRequest={({ url }) => url === "about:blank"}
      onMessage={({ nativeEvent }) => {
        const message = JSON.parse(nativeEvent.data) as { height?: number; error?: string };
        if (message.error) onError(message.error);
        if (message.height && Number.isFinite(message.height)) setHeight(message.height);
      }}
      onError={({ nativeEvent }) => onError(nativeEvent.description)}
      onContentProcessDidTerminate={() => onError("Diagram renderer stopped")}
    />
  );
}
