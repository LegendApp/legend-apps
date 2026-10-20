import { WebView } from "react-native-webview";
import type { ChartData } from "./richCharts";

const colors = ["#548af7", "#23a883", "#edaa39", "#b277dc", "#e26979", "#36a5bb"];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);
const formatNumber = (value: number) => value !== 0 && (Math.abs(value) >= 1e7 || Math.abs(value) < 0.001)
  ? value.toExponential(2)
  : Number(value.toPrecision(4)).toLocaleString("en-US");
const allowDocument = ({ url }: { url: string }) => url === "about:blank";

export function MarkdownChart({ chart, color = "#68707c", onError }: {
  chart: ChartData;
  color?: string;
  onError?: (message: string) => void;
}) {
  const labels = chart.type === "pie" ? chart.x : chart.series.map(series => series.name);
  const height = 292 + labels.length * 22;
  const title = chart.title ? `<text x="64" y="24" font-size="17" font-weight="600">${escapeHtml(chart.title)}</text>` : "";
  const unit = chart.unit ? ` ${chart.unit}` : "";
  const legend = labels.map((label, index) => {
    const value = chart.type === "pie" ? `: ${formatNumber(chart.series[0]!.data[index]!)}${unit}` : "";
    return `<rect x="64" y="${282 + index * 22}" width="10" height="10" rx="2" fill="${colors[index % colors.length]}"/><text x="82" y="${291 + index * 22}">${escapeHtml(label + value)}</text>`;
  }).join("");
  let drawing = "";
  const scale = Math.max(...chart.series.flatMap(series => series.data.map(Math.abs))) || 1;
  if (chart.type === "pie") {
    const data = chart.series[0]!.data;
    const total = data.reduce((sum, value) => sum + value / scale, 0);
    let angle = -Math.PI / 2;
    drawing = data.map((value, index) => {
      const sweep = (value / scale / total) * Math.PI * 2;
      const end = angle + sweep;
      const fill = colors[index % colors.length];
      let slice = "";
      if (sweep >= Math.PI * 2 - 1e-10) {
        slice = `<circle cx="320" cy="154" r="96" fill="${fill}"/>`;
      } else if (value > 0) {
        slice = `<path d="M320 154 L${320 + 96 * Math.cos(angle)} ${154 + 96 * Math.sin(angle)} A96 96 0 ${sweep > Math.PI ? 1 : 0} 1 ${320 + 96 * Math.cos(end)} ${154 + 96 * Math.sin(end)} Z" fill="${fill}"/>`;
      }
      angle = end;
      return slice;
    }).join("");
  } else {
    const normalized = chart.series.map(series => series.data.map(value => value / scale));
    const positive = chart.x.map((_, index) => normalized.reduce((sum, data) => sum + Math.max(0, data[index]!), 0));
    const negative = chart.x.map((_, index) => normalized.reduce((sum, data) => sum + Math.min(0, data[index]!), 0));
    const minimum = Math.min(0, ...(chart.stacked ? negative : normalized.flat()));
    const maximum = Math.max(0, ...(chart.stacked ? positive : normalized.flat())) || (minimum === 0 ? 1 : 0);
    const y = (value: number) => 238 - (value - minimum) / (maximum - minimum) * 186;
    const slot = 552 / chart.x.length;
    const x = (index: number) => 64 + slot * (index + 0.5);
    for (let index = 0; index <= 4; index++) {
      const value = minimum + (maximum - minimum) * index / 4;
      const position = y(value);
      drawing += `<line x1="64" y1="${position}" x2="616" y2="${position}" stroke="currentColor" stroke-opacity="0.16"/><text x="57" y="${position + 4}" text-anchor="end" font-size="11">${formatNumber(value * scale)}</text>`;
    }
    if (chart.unit) drawing += `<text x="64" y="43" font-size="11">${escapeHtml(chart.unit)}</text>`;
    drawing += `<line x1="64" y1="${y(0)}" x2="616" y2="${y(0)}" stroke="currentColor" stroke-opacity="0.5"/>`;
    drawing += chart.x.map((label, index) => `<text x="${x(index)}" y="261" text-anchor="middle" font-size="11"><title>${escapeHtml(label)}</title>${escapeHtml(label.length > 18 ? `${label.slice(0, 17)}…` : label)}</text>`).join("");
    const positiveOffsets = chart.x.map(() => 0);
    const negativeOffsets = chart.x.map(() => 0);
    drawing += normalized.map((data, seriesIndex) => {
      const fill = colors[seriesIndex % colors.length];
      if (chart.type === "line") {
        const points = data.map((value, index) => `${x(index)},${y(value)}`).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${fill}" stroke-width="2.5"/>${data.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="3.5" fill="${fill}"/>`).join("")}`;
      }
      const width = slot * 0.75 / (chart.stacked ? 1 : chart.series.length);
      return data.map((value, index) => {
        const offsets = value >= 0 ? positiveOffsets : negativeOffsets;
        const start = chart.stacked ? offsets[index]! : 0;
        offsets[index] = start + value;
        const left = x(index) - slot * 0.375 + (chart.stacked ? 0 : width * seriesIndex);
        return `<rect x="${left}" y="${Math.min(y(start), y(start + value))}" width="${width}" height="${Math.abs(y(start) - y(start + value))}" fill="${fill}"/>`;
      }).join("");
    }).join("");
  }
  const description = chart.series.map(series => `${series.name}: ${chart.x.map((label, index) => `${label} ${series.data[index]}${unit}`).join(", ")}`).join("; ");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;height:100%;background:transparent;color:${escapeHtml(color)}}svg{width:100%;height:100%;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;fill:currentColor}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${height}" role="img"><title>${escapeHtml(chart.title ?? `${chart.type} chart`)}</title><desc>${escapeHtml(description)}</desc>${title}${drawing}${legend}</svg></body></html>`;
  return (
    <WebView
      source={{ html }}
      originWhitelist={["about:blank"]}
      onShouldStartLoadWithRequest={allowDocument}
      onError={({ nativeEvent }) => onError?.(nativeEvent.description)}
      onContentProcessDidTerminate={() => onError?.("Chart renderer stopped")}
      javaScriptEnabled={false}
      scrollEnabled={false}
      accessibilityLabel={`${chart.title ?? `${chart.type} chart`}. ${description}`}
      containerStyle={{ height, flex: 0 }}
      style={{ backgroundColor: "transparent" }}
    />
  );
}
