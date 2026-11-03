import type { ReactNode } from "react";
import { Bloom, Card, Floor, Fog, KeyLight, Vignette, WorldSlide } from "slides:world/World";

const track = { spacing: 18, duration: 1.5, cruise: 0.12 };
const colors = ["#22d3ee", "#f59e0b", "#a78bfa"];
const source = ["a = 24", "b = 40", "c = 32"];

function Frame({ children }: { children: ReactNode }) {
  return <WorldSlide world="continuity-showcase" track={track} quality="auto" exposure={1.1}>
    {children}
    <KeyLight intensity={2} />
    <Floor y={-3.4} color="#101827" roughness={0.14} size={600}
      grid={{ spacing: 3 }} lines={[{ x: 7, color: "#22d3ee", intensity: 0.5, width: 0.06 }]} />
    <Bloom intensity={0.8} />
    <Fog density={0.018} />
    <Vignette amount={0.25} />
  </WorldSlide>;
}

export function Panels() {
  return <Frame>{source.map((title, i) => <Card key={title} id={`sample-${i}`} title={title} mono avatar={0}
    color={colors[i]} position={[(i - 1) * 4.8, 0.5 + (i % 2) * 0.7, 0]}
    scale={[4.1, 1.6, 0.18]} emissive={0.6} />)}</Frame>;
}

export function OnTrack() {
  return <Frame>{source.map((title, i) => <Card key={title} id={`sample-${i}`} title={title} mono avatar={0}
    color={colors[i]} position={[(i - 1) * 3.6, -2.3, -2 + i * 1.5]}
    scale={[3, 0.65, 0.5]} emissive={0.9} />)}</Frame>;
}

export function Columns() {
  const heights = [3, 5, 4];
  return <Frame>{source.map((title, i) => <Card key={title} id={`sample-${i}`} title={title} titleOpacity={0} mono avatar={0}
    color={colors[i]} position={[(i - 1) * 3.6, -3.4 + heights[i] / 2, 0]}
    scale={[1.3, heights[i], 1.3]} emissive={0.6} />)}</Frame>;
}
