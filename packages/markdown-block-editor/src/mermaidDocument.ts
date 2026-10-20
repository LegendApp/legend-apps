import runtime from "./mermaidRuntime.json";

export function createMermaidDocument(source: string, dark: boolean) {
  const serializedSource = JSON.stringify(source).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<style>html,body{margin:0;background:transparent}#diagram{padding:12px;box-sizing:border-box}svg{display:block;max-width:100%;height:auto;margin:auto}</style>
</head><body><div id="diagram"></div>
<script>${runtime.replace(/<\/script/gi, "<\\/script")}</script>
<script>
const send = message => window.ReactNativeWebView.postMessage(JSON.stringify(message));
(async () => {
  try {
    mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"${dark ? "dark" : "default"}",suppressErrorRendering:true});
    const {svg} = await mermaid.render("markdown-diagram", ${serializedSource});
    const diagram = document.getElementById("diagram");
    diagram.innerHTML = svg;
    const resize = () => send({height:Math.ceil(diagram.getBoundingClientRect().height)});
    new ResizeObserver(resize).observe(diagram);
    resize();
  } catch (error) {
    send({error:String(error.message || error).split("\\n")[0]});
  }
})();
</script></body></html>`;
}
