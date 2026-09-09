import { StyleSheet, Text, View } from "react-native";
import { BenchmarkChart } from "./Scene";
import { AttentionStage, AttentionTarget, Callout, CodeWalkthrough, ComparisonWipe, ContentSwap,
  ExplodedLayers, FreezeFrame, ProgressiveDetail, Spotlight } from "./packs/presenting";
import { useMotion } from "./packs/presenting/motion";

const ideas = [
  { id: "react", title: "React", detail: "Compose the product", color: "#123849" },
  { id: "native", title: "Native", detail: "Use the platform", color: "#252b57" },
  { id: "gpu", title: "GPU", detail: "Draw your own world", color: "#43265b" },
];
function Card({ title, detail, color = "#123849" }: { title: string; detail: string; color?: string }) {
  return <View style={[styles.card, { backgroundColor: color }]}>
    <Text style={styles.cardTitle}>{title}</Text><Text style={styles.detail}>{detail}</Text>
  </View>;
}

export function SpotlightDemo({ focus }: { focus?: string }) {
  return <AttentionStage style={styles.frame}>
    <View style={styles.cards}>{ideas.map((idea) => <AttentionTarget id={idea.id} key={idea.id} style={styles.target}>
      <Card {...idea} />
    </AttentionTarget>)}</View>
    <Spotlight target={focus} />
    {focus && <Callout target={focus} side="below">{ideas.find((idea) => idea.id === focus)?.detail}</Callout>}
  </AttentionStage>;
}

function Orbit({ seconds }: { seconds: number }) {
  return <View style={styles.orbit}>
    <View style={styles.ring} />
    <Text style={styles.centerLabel}>ONE CLOCK</Text>
    {Array.from({ length: 8 }, (_, index) => {
      const angle = seconds * 0.9 + index * Math.PI / 4;
      return <View key={index} style={{ position: "absolute", left: 770 + Math.cos(angle) * 230,
        top: 240 + Math.sin(angle) * 195, width: 64, height: 64, borderRadius: 22,
        backgroundColor: index === 0 ? "#fbbf24" : "#67e8f9", opacity: index === 0 ? 1 : 0.55 }} />;
    })}
    <Text style={styles.clock}>{seconds.toFixed(2)} seconds</Text>
  </View>;
}
export function FreezeDemo({ paused }: { paused: boolean }) {
  return <FreezeFrame paused={paused} annotation={<View pointerEvents="none" style={styles.annotation}>
    <View style={styles.annotationCircle} />
    <View style={styles.annotationLabel}><Text style={styles.cardTitle}>Hold that thought.</Text>
      <Text style={styles.detail}>The clock stops here. Advance to resume.</Text></View>
  </View>}>
    {(seconds) => <Orbit seconds={seconds} />}
  </FreezeFrame>;
}

export function ProgressiveDemo({ expanded }: { expanded: boolean }) {
  return <ProgressiveDetail expanded={expanded} style={styles.frame}
    summary={<Card title="Native document" detail="One small interface" />}
    detail={<View style={styles.detailStack}>
      <Card title="Memory-mapped file" detail="Keep the input native." color="#193144" />
      <Card title="Selective C++ parsing" detail="Read the structure you need." color="#252b57" />
      <Card title="Lazy row requests" detail="React asks for visible content." color="#43265b" />
    </View>} />;
}

function MiniApp({ refined }: { refined: boolean }) {
  return <View style={[styles.miniApp, { backgroundColor: refined ? "#0d2438" : "#1a1d24" }]}>
    <View style={[styles.sidebar, { backgroundColor: refined ? "#174156" : "#30333b" }]}>
      <Text style={styles.detail}>CHAT HISTORY</Text>
      {["Design an app", "Explore an idea", "Make it native"].map((label, index) => <View key={label}
        style={{ padding: 22, marginTop: 14, borderRadius: refined ? 18 : 0, backgroundColor: index === 1 ? refined ? "#32687b" : "#4b4d54" : "transparent" }}>
        <Text style={styles.detail}>{label}</Text>
      </View>)}
    </View>
    <View style={styles.conversation}><Text style={styles.cardTitle}>The same content.</Text>
      <Text style={styles.detail}>Compare the design without losing your place.</Text>
      <View style={{ height: 130, marginTop: 35, borderRadius: refined ? 28 : 0, backgroundColor: refined ? "#255265" : "#323640", padding: 28 }}>
        <Text style={styles.detail}>Layout and labels remain aligned.</Text>
      </View>
    </View>
  </View>;
}
export function WipeDemo({ position }: { position: number }) {
  return <ComparisonWipe position={position} style={styles.frame} before={<MiniApp refined={false} />} after={<MiniApp refined />}
    beforeLabel="Original · illustration" afterLabel="Refined · illustration" />;
}

export function CalloutDemo({ moved }: { moved: boolean }) {
  const [x, scale] = useMotion([moved ? 860 : 180, moved ? 0.86 : 1], 1100);
  return <AttentionStage style={styles.frame}>
    <AttentionTarget id="moving-card" style={{ position: "absolute", left: x, top: 230, width: 490, transform: [{ scale }] }}>
      <Card title="Native module" detail="This target can move and resize." color="#252b57" />
    </AttentionTarget>
    <Callout target="moving-card" side="above">Attached by ID, not by coordinates.</Callout>
  </AttentionStage>;
}

const exampleSource = `const document = openHistory(path);
const count = document.rowCount;

function renderRow(index: number) {
  const row = document.getRowMetadata(index);
  return <Message title={row.title} />;
}`;
const codeExplanations = [
  ["Keep ownership native", "Open the document and ask how much content it contains."],
  ["Request one row", "Read only the metadata needed for the visible item."],
  ["Compose the UI", "Turn a small result into an ordinary React component."],
];
export function CodeDemo({ focus }: { focus: number }) {
  const ranges = [[1, 2], [4, 5], [6, 6]] as const;
  const index = Math.min(2, Math.max(0, focus));
  return <CodeWalkthrough source={exampleSource} lines={ranges[index]} explanation={<>
    <Text style={styles.cardTitle}>{codeExplanations[index][0]}</Text>
    <Text style={styles.detail}>{codeExplanations[index][1]}</Text>
    <Text style={styles.small}>Illustrative API excerpt</Text>
  </>} />;
}

export function LayersDemo({ expanded }: { expanded: boolean }) {
  return <ExplodedLayers expanded={expanded} style={styles.frame} layers={[
    { id: "react", label: "React content", color: "#155e75", content: <Text style={styles.detail}>Components · state · events</Text> },
    { id: "container", label: "Native container", color: "#164e63", content: <Text style={styles.detail}>Layout · focus · input</Text> },
    { id: "graphics", label: "Graphics surface", color: "#312e81", content: <Text style={styles.detail}>Skia · TypeGPU · custom drawing</Text> },
    { id: "platform", label: "Platform", color: "#4c1d95", content: <Text style={styles.detail}>Window · menus · materials</Text> },
  ]} />;
}

export function SwapDemo({ summary }: { summary: boolean }) {
  return <ContentSwap active={summary} style={styles.frame}
    before={<View style={styles.chart}><BenchmarkChart metric="content" /></View>}
    after={<View style={styles.takeaway}><Text style={styles.stat}>394 ms</Text>
      <Text style={styles.cardTitle}>React Native was ready first.</Text>
      <Text style={styles.detail}>First stable content in this Chat History comparison.</Text>
      <Text style={styles.small}>p50 · macOS · production builds · warm filesystem cache</Text>
    </View>} />;
}
const styles = StyleSheet.create({
  frame: { width: 1680, height: 580 },
  cards: { flexDirection: "row", justifyContent: "center", gap: 40, paddingTop: 155 },
  target: { width: 470 },
  card: { borderRadius: 24, borderWidth: 1, borderColor: "#52758b", padding: 28, gap: 20, minHeight: 135 },
  cardTitle: { color: "#f8fafc", fontSize: 42, fontWeight: "700" },
  detail: { color: "#cbd5e1", fontSize: 27, lineHeight: 36 },
  small: { color: "#94a3b8", fontSize: 22, lineHeight: 30 },
  orbit: { width: 1680, height: 580, borderRadius: 28, backgroundColor: "#091423" },
  ring: { position: "absolute", width: 500, height: 425, left: 552, top: 60, borderRadius: 250, borderWidth: 2, borderColor: "#24546a" },
  centerLabel: { position: "absolute", top: 260, left: 700, color: "#94a3b8", fontSize: 24, letterSpacing: 4 },
  clock: { position: "absolute", bottom: 28, left: 36, color: "#67e8f9", fontSize: 30, fontVariant: ["tabular-nums"] },
  annotation: { ...StyleSheet.absoluteFillObject },
  annotationCircle: { position: "absolute", left: 532, top: 38, width: 550, height: 475, borderRadius: 280, borderWidth: 5, borderColor: "#fbbf24", transform: [{ rotate: "-8deg" }] },
  annotationLabel: { position: "absolute", right: 28, top: 120, width: 470, padding: 26, gap: 20, borderRadius: 20, borderWidth: 2, borderColor: "#fbbf24", backgroundColor: "#242219" },
  detailStack: { gap: 18, minWidth: 740 },
  miniApp: { width: 1680, height: 580, flexDirection: "row", paddingTop: 80 },
  sidebar: { width: 460, padding: 30 },
  conversation: { flex: 1, padding: 65 },
  chart: { flex: 1, justifyContent: "center", paddingHorizontal: 30 },
  takeaway: { flex: 1, alignItems: "center", justifyContent: "center", gap: 28 },
  stat: { color: "#67e8f9", fontSize: 128, fontWeight: "800" },
});
