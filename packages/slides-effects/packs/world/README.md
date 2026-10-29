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

The pipeline is an instanced HDR scene with depth, optional planar reflections,
height fog and volumetric lights, depth of field, a half-resolution bloom mip
chain, chromatic aberration, ACES exposure/tonemapping, sRGB encoding, vignette
and grain. `high` and `auto` use full-resolution scene targets and five
bloom levels. `medium` uses 0.85 scene scale and five levels; `low` uses 0.65 scene
scale and three levels. Output resolution stays unchanged. `auto` currently
selects the high preset; it does not change quality based on frame timing.

For a raw WGSL escape hatch, use `GPURenderGraph` from
`@legend-apps/presentation`. `buildWorldGraph` and the pure `scene.ts` helpers
expose the same description and deterministic uniform samples for measurement.
The scene hooks below share that pipeline. All animation samples the same clock;
no frame history or per-frame React render is required.

Generate a standalone browser measurement page from the repository root:

```sh
bun packages/slides-effects/scripts/world-benchmark.mjs --output /tmp/world-harness.html
```

Open that file in Chrome with WebGPU and run
`await benchmarkWorld({ width: 1920, height: 1080, quality: "high" })` in its console.
Repeat at 3840×2160 and with each preset. Results report completed-submit frame
times and per-pass GPU timestamps when available. Throughput measurements do not
measure display refresh rate or prove a particular presentation frame rate.


## Focus, floor and lighting

```tsx
import { DOF, Floor, Material, PointLight, SpotLight, RimLight, Shafts, Chromatic } from "slides:world/World";

<World width={1696} height={650}>
  <Camera shots={[{ step: 0, position: [0, 4, 16], target: [0, 0, 0] }]} />
  <Material id="stone" albedo="#243047" roughness={0.6} metal={0.15} rim={0.8} />
  <Box id="subject" material="stone" scale={[1, 3, 1]} emissive={0.1} />
  <PointLight position={[-4, 5, 4]} color="#f59e0b" intensity={6} range={20} />
  <SpotLight position={[3, 7, 0]} target={[0, 0, 0]} color="#22d3ee" angle={0.4} intensity={12} range={24} />
  <RimLight color="#22d3ee" intensity={1.5} />
  <Floor mirror y={-1.5} roughness={0.06} reflectivity={0.8} size={40} />
  <DOF focus={{ 0: 16, 1: "subject" }} aperture={0.6} maxBlur={12} />
  <Fog density={0.03} /><Shafts intensity={0.6} density={0.03} anisotropy={0.3} />
  <Bloom intensity={1.2} /><Chromatic amount={0.002} />
</World>
```

Focus accepts an animated distance or object id. Camera shots also accept `focus`.
An explicit DOF focus track takes precedence; otherwise the active shot supplies
focus, falling back to the camera target.
Object focus resolves the same sampled position as camera follow, then uses
view-space depth to match the depth buffer. A pulse, logical row or stage can be
both a camera target and a focus target.

Materials can be declared by id or passed inline through a primitive's `material`
prop. Albedo, emissive intensity, roughness, metal and rim strength support tracks.
Point and spot lights support animated position, target, color, intensity, range
and spot angle (radians). Intensity uses relative linear-light units, with
inverse-square attenuation beyond one world unit and a smooth cutoff at range.
Spot angle is the outer cone half-angle. Materials use GGX specular, Schlick
fresnel and energy-conserving diffuse; `metal` tints specular with albedo and
reduces diffuse. Surface radiance is capped at 4096 linear units to retain
half-float headroom for bloom. At most four local lights are supported. `RimLight`
adds a shared view-dependent rim color/intensity, including on dark materials.

Spheres, orbs and spray use six-vertex analytic spheres with curved normals,
nonuniform scale and surface depth. Emissive spheres have a bright round center
and radial falloff; bloom supplies the surrounding halo. Emission contributes
HDR radiance but does not automatically create a local light. Place a point light
near an emissive subject when it should illuminate nearby surfaces.

The mirror redraws the scene about the floor plane into a half-resolution
reflection target and clips geometry below it. Roughness broadens and fades the
reflection with distance; reflectivity controls its strength, with fresnel and
metal controlling its viewing-angle response. Reflection taps stay inside the
viewport and fade near the finite floor boundary. The regular fog stage also
fades the floor into the scene.

DOF uses a half-resolution gather and depth-aware composite. Shafts integrate
point/spot scattering along the visible camera ray at quarter resolution.
Static `scale` overrides are available on DOF, Floor (reflection resolution) and
Shafts; DOF and Shafts also accept `samples`. These change pipeline topology.
Animated focus, aperture, blur radius, lighting and effect strengths update uniforms.

## Paths, recycled rows and stages

```tsx
import { PathPulse, Spray, Rows, Stage, flyTo } from "slides:world/World";

<PathPulse id="pulse" path={["root", "b", "b2"]} step={1} duration={2.4}
  color="#22d3ee" size={0.08} trail={0.18} />
<Spray under="leaves:lit" rate={40} lifetime={2} color="#22d3ee" />
<Rows id="rows" count={9} spacing={1.1} speed={0.3}
  changes={[{ row: 4, step: 1 }, { row: 6, step: 2 }]}
  color="#163047" flashColor="#22d3ee" />
<Stage id="b" position={[12, 0, 0]} glow={0.6}>
  <Box color="#22d3ee" emissive={4} />
</Stage>
<Camera shots={[flyTo("b", { step: 2, arc: 4, duration: 1.5, offset: [0, 4, 10] })]} />
```

Pulse paths accept positions or ids; bare graph ids resolve as `node:<id>`.
The head follows the graph's curved edges. Its short straight trail joins two
sampled path positions and can cut across a bend. Ambient Spray accepts
`position`, `spread`, `velocity` and `seed`; `under="leaves:lit"` emits beneath
active leaves. Motion, birth and lifetime are analytic samples of absolute time.

Rows keep a fixed instance pool while logical row ids advance with the clock.
Only listed changes flash; recycled slots do not inherit a previous row's flash.
Use `rows:row:4` to follow or focus logical row 4 while it is visible.
`width`, `depth`, `start`, `flashDuration` and `position` configure the column.
Stages offset nested primitives and multiply their glow. Stage positions and glow
can be animated. Lights and the floor remain world-space settings even when
nested in a Stage. `flyTo` targets `stage:<id>` with a deterministic eased transition;
use that explicit prefix when following a stage directly. An eased flight is the
default; a positive `arc` adds vertical curvature to the transition.

## Voxel reduction and counter

```tsx
import { Voxels, WorldCounter } from "slides:world/World";

<Voxels id="cells" grid={[8, 8, 8]} spacing={0.5} size={0.18}
  color="#22d3ee" collapse={{ step: 1, to: 0.2, duration: 2.4 }} />
<WorldCounter source="cells" position={[0.82, 0.2]} size={0.07} color="#ffffff" />
```

`to` is the surviving count fraction. Surviving boxes compact and other boxes
shrink away. The counter samples the same reduction and draws numeric digits
after the built-in post effects, so focus, fog and bloom do not obscure them.
Custom hooks after tonemap also affect the digits. Position and
height use normalized canvas coordinates. Put a static label in a normal text
overlay. The counter does not schedule React updates.

## Post order

The default HDR order is fog, DOF, then bloom. Set
`<World postOrder={["dof", "fog", "bloom"]}>` to reorder these stages. Supply each
name exactly once; unknown, missing or duplicate stages are errors. A disabled
effect is a no-op stage, so custom hooks retain a predictable attachment point.
Tonemapping remains after the HDR stages. Custom hooks can also run after it.

## WGSL hooks

A custom post fragment receives the previous stage's color, linear depth and the
shared clock. `sampleHDR(uv)` reads the original scene HDR target;
`sampleDepth(uv)` returns linear view depth.

```tsx
import { Pass } from "slides:world/World";

const lines = `
fn customPass(uv:vec2f, color:vec4f, ctx:PassContext)->vec4f {
  let line=.96+.04*sin(uv.y*800.+ctx.slideTime*.3);
  return vec4f(color.rgb*line,color.a);
}`;
<Pass wgsl={lines} after="bloom" />
```

`PassContext` fields are `time`, `slideTime`, `stepTime`, `step` and `depth`.
Use the function name `customPass`; `pass` is reserved in WGSL. Placement accepts
`scene`, `fog`, `dof`, `bloom` or `tonemap` through one `before` or `after` prop.
Before tonemapping, colors are linear HDR. After tonemapping, colors are sRGB LDR;
output then copies to the screen without a second tonemap. `before="scene"` is
invalid. Additional `reads` follow the fixed previous/depth/HDR texture bindings
at group 0 binding 6 onward; declare their WGSL bindings explicitly. Raw
`GPURenderGraph` exposes the full resource/pass contract.

Custom instanced geometry supplies local positions/normals and a material. The
pack handles camera projection, depth, lighting, fog and the post chain.

```tsx
import { Custom } from "slides:world/World";

const quad = `
fn shape(id:u32,vid:u32,ctx:ShapeContext)->ShapeVertex {
  let corners=array<vec2f,6>(vec2f(-1.,-1.),vec2f(1.,-1.),vec2f(-1.,1.),
    vec2f(-1.,1.),vec2f(1.,-1.),vec2f(1.,1.));
  let p=corners[vid%6u];
  return ShapeVertex(vec3f(p.x+(f32(id)-1.)*3.,p.y,0.),vec3f(0.,0.,1.));
}
fn shade(id:u32,world:vec3f,normal:vec3f,ctx:ShapeContext)->Material {
  return Material(vec3f(.03,.3,.4),vec3f(.03,.7,.9)*2.,.4,.1);
}`;
<Custom wgsl={quad} count={3} vertexCount={6} />
```

`ShapeContext` contains `time`, `slideTime`, `stepTime` and `step`. `ShapeVertex`
contains `position` and `normal`. WGSL `Material` contains `albedo`, `emissive`
(RGB), `roughness` and `metal`. Primitive position, scale and material props are
also available on Custom.

An SDF runs inside a local bounding-box proxy and writes the depth of the actual
hit. Keep the shape inside its declared bounds; `steps` controls march cost.

```tsx
import { SDF } from "slides:world/World";

const roundedBox = `
fn sdf(p:vec3f)->f32 {
  let q=abs(p)-vec3f(.8,1.3,.8);
  return length(max(q,vec3f(0.)))+min(max(q.x,max(q.y,q.z)),0.)-.15;
}`;
<SDF wgsl={roundedBox} bounds={[[-2,-2,-2],[2,2,2]]}
  color="#22d3ee" emissive={0.3} />
```

WGSL compilation/validation errors use the normal slide diagnostic path. The
`world-tour.mdx` deck executes all three hook examples; `data-flow.mdx` shows
pulse following, changed rows, stage flights and voxel reduction.
