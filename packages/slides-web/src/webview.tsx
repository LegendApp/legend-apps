export function Webview({ src, html, componentScript, componentCss, width = 1200, height = 650 }: any) {
  const content = componentScript ? `<html><head><style>${componentCss ?? ""}</style></head><body><div id="root"></div><script>${componentScript}</script></body></html>` : html;
  return <iframe src={src} srcDoc={content} style={{ width, height, border: 0 }} title="Slide demo" />;
}
