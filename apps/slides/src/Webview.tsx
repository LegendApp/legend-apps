import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewProps } from "react-native-webview";

type WebviewProps = Omit<WebViewProps, "source" | "style"> & {
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
  baseUrl,
  componentCss,
  componentScript,
  html,
  originWhitelist = defaultOriginWhitelist,
  props,
  readAccessUrl,
  src,
  style,
  ...webViewProps
}: WebviewProps) {
  const document = componentScript
    ? createComponentDocument(componentScript, componentCss, props)
    : html;
  const source = document === undefined
    ? { uri: src ?? "about:blank" }
    : { baseUrl, html: document };

  return (
    <WebView
      {...webViewProps}
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
