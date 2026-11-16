import { Background } from "@legend-apps/presentation";
import type { ReactNode } from "react";
import { d } from "typegpu";
import { Bloom, Camera, DOF, Effect, Floor, PointLight, Sphere, Journey, defineJourneyEffect, type JourneyEffectGraph } from "slides:journey/Journey";

/** A deck-defined TypeGPU effect: tints the scene by depth. Its params are animated like any Journey prop. */
const depthTint = defineJourneyEffect({
  name: "depth-tint", params: { amount: d.f32, tint: d.vec3f, far: d.f32 }, defaults: { amount: 0, tint: "#3b82f6", far: 40 }, after: "bloom",
  build: ({ input, id }): JourneyEffectGraph => ({ passes: [{ id: id(), fragment: "depthTint", reads: { source: input, depth: "depth" }, output: id(),
    wgsl: `@fragment fn depthTint(@location(0) uv:vec2f)->@location(0) vec4f {
 let p=params(); let color=textureSampleLevel(source,linearSampler,uv,0.).rgb;
 let t=p.amount*smoothstep(0.,p.far,depthAt(uv));
 return vec4f(mix(color,p.tint*dot(color,vec3f(.2126,.7152,.0722))*2.,t),1.);
}` }] }),
});

/** Journey collects its parts from elements and fragments, so shared parts come from a function, not a component. */
function scene(extra: ReactNode) {
  const colors = ["#f97316", "#facc15", "#22d3ee", "#a855f7", "#ec4899", "#4ade80"];
  return <>
    <Camera shots={[{ at: 0, position: [0, 3, 16], target: [3, 3.2, -10] }]} />
    {colors.map((color, i) => <Sphere key={i} id={i === 0 ? "near" : i === colors.length - 1 ? "far" : `ball-${i}`}
      position={[-5 + i * 2.6, -0.4, 6 - i * 7]} size={1.2} color={color} emissive={1.2} />)}
    <PointLight position={[0, 6, 4]} intensity={6} range={60} />
    <Floor y={-1.8} color="#111827" roughness={0.35} />
    <Bloom intensity={0.6} />
    {extra}
  </>;
}

/** Focus pulls from the near sphere to the far one on the next step. */
export function FocusPull() {
  return <Background><Journey id="effects-demo" background quality="high">
    {scene(<DOF focus={{ 0: "near", 1: "far" }} aperture={2.5} maxBlur={24} />)}
  </Journey></Background>;
}

/** The same scene through the deck's own effect, eased in on the next step. */
export function DepthTint() {
  return <Background><Journey id="effects-demo" background quality="high">
    {scene(<Effect use={depthTint({ amount: { 0: 0, 1: 0.85 } })} />)}
  </Journey></Background>;
}
