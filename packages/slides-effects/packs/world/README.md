# World

A deterministic instanced 3D scene for macOS and offline WebGPU exports. It uses
the presentation clock on the UI thread and a generic multipass GPU host. Import
only this pack's entrypoint:

```tsx
import { World, Camera, Graph, tree, wave, subset, Orbs, Ring, Fog, Bloom, Vignette, Grain } from "slides:world/World";

const network = tree("root", [["a", ["a1", "a2"]], ["b", ["b1", "b2"]]]);

<World width={1696} height={650} exposure={{ 0: 1, 2: 1.2 }}>
  <Camera duration={1.2} ease="cubic" shots={[
    { step: 0, position: [0, 5, 18], target: [0, 0, 0], fov: 42 },
    { step: 1, orbit: { center: [0, 0, 0], radius: 15, height: 5, speed: 0.12 } },
    { step: 2, follow: "node:b2", dolly: 8 },
  ]} />
  <Graph data={network} activate={[
    wave({ from: "root", step: 1, speed: 0.35 }),
    subset({ branches: ["b"], step: 2 }),
  ]} />
  <Ring radius={7} position={[0, -5, 0]} color="#22d3ee" emissive={3} />
  <Fog density={0.025} color="#05060a" />
  <Bloom intensity={1.4} radius={0.8} threshold={1} />
  <Vignette amount={0.3} /><Grain amount={0.015} />
</World>
```

`World` accepts `background`, `backgroundColor`, `quality`, `exposure`, `scrim`,
`previewTime`, `active`, `borderRadius` and `fallback`. Normal React Native
children are overlaid above the canvas; keep text in those children or in normal
slide layers. A local GPU boundary displays `fallback` on unsupported adapters;
the default is the dark background. GPU errors produce a diagnostic. A background
world fills the background host's dimensions.

`Camera.shots` are ordered keyframes with either a `step` or an `at` time in
seconds. Times and step numbers should increase within their respective clock.
Each shot inherits unspecified values from the pose sampled when it starts;
moving prior shots freeze at that boundary. `position`, `target`, `fov`, `roll`,
`orbit`, `follow` and `dolly` are supported. Orbit speed is radians per second;
dolly is the distance from the target. Easing is `linear`, `cubic`, `smoothstep`,
`expo` or `spring`; durations are seconds. `follow` uses instance ids, including
`node:<id>` and `orb:<index>`. Reuse a world `id` and set
`enter={{ from: "previous", duration: 1 }}` on a later slide to ease from its last
live camera pose. Preparation and previews never overwrite retained live poses.

`Sphere`, `Box`, `Tube` and `Ring` accept `position`, `size`, `scale`, `color`,
`emissive` and `id`. Tube adds `end`, `curve` and `thickness`; ring adds `radius`
and `thickness`. `Orbs` accepts `count`, `colors`, `radius`, `spread`, `position`,
`seed`, `drift`, `emissive` and an `id` prefix (default `orb`). Use distinct prefixes
for multiple orb fields; all scene instance ids must be unique. Its seeded
distribution and drifting motion are repeatable at any sampled time. No frame
integration is used.

`Graph` accepts a tree, `radius`, `levelHeight`, `position`, `node` and `edge`.
Node defaults are `color`, `dim`, `size`, `emissive` and `scale`. Use the `nodes`
map for per-id animated position, color, scale, size or emissive overrides.
Edges attach to the evaluated node positions. Edge options are `color`,
`curve`, `thickness` and `glow`. `wave.speed` is seconds per depth level, and
`subset.branches` selects roots plus descendants. The latest activation eases
from the previous state; other branches become dim. Duplicate ids are rejected.

Primitive position, scale, size, color and emissive, exposure, fog settings,
bloom settings, vignette and grain accept constants, step maps or keyframes:

```tsx
<Sphere position={{ 0: [-2, 0, 0], 1: [2, 0, 0] }}
  color={[{ at: 0, value: "#22d3ee" }, { at: 3, value: "#b56bff", duration: 1 }]} />
```

The first value is the baseline. Default scalar/vector transitions last 0.65s.
Colors use `#RGB` or `#RRGGBB` and interpolate in linear light. Direct entry into
a later step settles missing earlier steps and animates the current step from
that state. Scrubbing and reverse navigation do not depend on prior GPU frames.
Backward navigation restarts the selected step's scripted transition.
Keyframe tables and graph activation are sampled in a UI worklet into one storage
uniform array. This keeps frame work off JavaScript, but uniform evaluation and
upload still scale with the instance count; the graph API targets 20–60 nodes.

The pipeline is an instanced HDR scene with depth, a half-resolution bloom mip
chain, exponential height fog, ACES exposure/tonemapping, sRGB encoding,
vignette and grain. `high` and `auto` use full-resolution scene targets and five
bloom levels. `medium` uses 0.85 scene scale and five levels; `low` uses 0.65 scene
scale and three levels. Output resolution stays unchanged. `auto` currently
selects the high preset; it does not change quality based on frame timing.

For a raw WGSL escape hatch, use `GPURenderGraph` from
`@legend-apps/presentation`. `buildWorldGraph` and the pure `scene.ts` helpers
expose the same description and deterministic uniform samples for measurement.
The scene-specific custom pass, material, reflection and depth-of-field APIs are
not part of this initial pack.

Generate a standalone browser measurement page from the repository root:

```sh
bun packages/slides-effects/scripts/world-benchmark.mjs --output /tmp/world-harness.html
```

Open that file in Chrome with WebGPU and run
`await benchmarkWorld({ width: 1920, height: 1080, quality: "high" })` in its console.
Repeat at 3840×2160 and with each preset. Results report completed-submit frame
times and per-pass GPU timestamps when available. Throughput measurements do not
measure display refresh rate or prove a particular presentation frame rate.
