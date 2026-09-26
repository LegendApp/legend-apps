import { useEffect, useRef } from "react";
import { usePresentationValue } from "@legend-apps/presentation";
import { webviewPlaybackScript } from "./webviewPlayback";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";

type WebviewProps = Omit<WebViewProps, "source" | "style"> & {
  previewTime?: number;
  baseUrl?: string;
  componentCss?: string;
  componentScript?: string;
  html?: string;
  props?: unknown;
  readAccessUrl?: string;
  src?: string;
  style?: StyleProp<ViewStyle>;
};

const defaultOriginWhitelist = ["*"];

function escapeInlineScript(value: string) {
  return value
    .replace(/<\/script/gi, "<\\/script")
    .replaceAll("<!--", "<\\!--")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function createComponentDocument(script: string, css: string | undefined, props: unknown) {
  const serializedProps = escapeInlineScript(JSON.stringify(props ?? {}) ?? "{}");
  const serializedScript = escapeInlineScript(script);
  const serializedCss = css?.replace(/<\/style/gi, "<\\/style") ?? "";
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<style>html,body,#root{width:100%;height:100%;margin:0}",
    serializedCss,
    "</style></head><body><div id=\"root\"></div>",
    `<script>window.__LEGEND_SLIDES_PROPS__=${serializedProps};</script>`,
    `<script>${serializedScript}</script>`,
    "</body></html>",
  ].join("");
}

export function Webview({
  previewTime = 1.25,
  baseUrl,
  componentCss,
  componentScript,
  html,
  originWhitelist = defaultOriginWhitelist,
  props,
  readAccessUrl,
  src,
  style,
  injectedJavaScriptBeforeContentLoaded,
  injectedJavaScriptBeforeContentLoadedForMainFrameOnly,
  onLoadEnd,
  ...webViewProps
}: WebviewProps) {
  const ref = useRef<WebView>(null);
  const configuredPhase = usePresentationValue("playbackPhase");
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const phase = configuredPhase ?? (preparing ? "preparing" : preview ? "preview" : active ? "playing" : "paused");
  const playbackScript = webviewPlaybackScript(phase, previewTime);
  useEffect(() => { ref.current?.injectJavaScript(playbackScript); }, [playbackScript]);
  const document = componentScript
    ? createComponentDocument(componentScript, componentCss, props)
    : html;
  const source = document === undefined
    ? { uri: src ?? "about:blank" }
    : { baseUrl, html: document };

  return (
    <WebView
      {...webViewProps}
      ref={ref}
      // Do not widen the frame scope of a caller's custom injected script.
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={injectedJavaScriptBeforeContentLoadedForMainFrameOnly ?? Boolean(injectedJavaScriptBeforeContentLoaded)}
      injectedJavaScriptBeforeContentLoaded={`${playbackScript}
${injectedJavaScriptBeforeContentLoaded ?? ""}
true;`}
      onLoadEnd={event => {
        // Navigation may complete after a phase change; always send current state.
        ref.current?.injectJavaScript(playbackScript);
        onLoadEnd?.(event);
      }}
      allowingReadAccessToURL={readAccessUrl}
      originWhitelist={originWhitelist}
      source={source}
      style={[styles.webview, style]}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
});
