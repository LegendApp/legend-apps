import { Background, usePresentationValue } from "@legend-apps/presentation";
import { Bloom, Box, Camera, Floor, Ring, Sphere, Journey } from "slides:journey/Journey";

/** Each build authors its at times from zero; the fixed ring and sphere carry across slides. */
export function LocalBuild({ second = false }: { second?: boolean }) {
  const step = usePresentationValue("stepIndex");
  const positions = second ? [[-4, 0, 0], [0, 2, 0], [4, 0, 0]] : [[-5, 0, 0], [0, 0, 0], [5, 0, 0], [-4, 0, 0]];
  const index = Math.min(step, positions.length - 2);
  return <Background><Journey id="local-build-demo" background clock="step" buildDuration={6}
    quality="high" enter={second ? { from: "previous", duration: 0.5 } : undefined}>
    <Camera shots={[{ at: 0, position: [0, 5, 19], target: [0, 0, 0] }]} />
    <Box id="traveller" size={1} color="#22d3ee" position={[
      { at: 0, value: positions[index] as [number, number, number] },
      { at: 0.3, value: positions[index + 1] as [number, number, number], duration: 5.7, ease: "smoothstep" },
    ]} />
    <Sphere id="anchor" position={[0, -1.5, -2]} size={0.7} color="#b56bff" />
    <Ring id="carry" radius={6} position={[0, -2, 0]} color="#f59e0b" />
    <Floor y={-2.2} color="#101729" roughness={0.7} />
    <Bloom intensity={0.5} />
  </Journey></Background>;
}
