# World

A deterministic instanced 3D scene for macOS and offline WebGPU exports. It uses
the presentation clock on the UI thread and a generic multipass GPU host.

## Getting started

Create a `.mdx` deck and open it in Legend Slides. If World is missing, install the
pack offered by the app before presenting. Keep the generated effect lockfile
beside the deck; installed, pinned packs work offline. World is a source pack,
not a package to add with npm. These APIs require a pack version containing them.
See [pack installation and local development](../../README.md).

This complete deck has two builds. Advance once to move the box and camera:

```mdx
---
title: A small world
width: 1920
height: 1080
transition: none
---

import { World, Camera, Box, Bloom } from "slides:world/World"

<Steps count={2}>{() => null}</Steps>
<World width={1600} height={800} clock="step" buildDuration={1.5}>
  <Camera shots={[
    { step: 0, position: [0, 3, 12], target: [0, 0, 0] },
    { step: 1, position: [4, 3, 10], target: [2, 0, 0], duration: 1.5 },
  ]} />
  <Box id="part" position={{ 0: [-2, 0, 0], 1: [2, 0, 0] }}
    color="#22d3ee" emissive={0.4} />
  <Bloom intensity={0.6} />
</World>
```

Import World declarations from `slides:world/World` in MDX or deck-local TSX.
Put cameras, geometry, lights and effects **inside** a World. Regular native text
can sit above its canvas. Coordinates are world units; the default camera looks
toward the origin with Y up. `width`/`height` are logical slide units, while
`renderScale` controls GPU target resolution. Timings are seconds; steps start at
zero and the deck's step count includes its initial state.

`World` accepts `background`, `backgroundColor`, `quality`, `renderScale`, `exposure`, `scrim`,
`previewTime`, `active`, `borderRadius` and `fallback`. Normal React Native
children are overlaid above the canvas; keep text in those children or in normal
slide layers. A local GPU boundary displays `fallback` on unsupported adapters;
the default is the dark background. GPU errors produce a diagnostic. A background
world fills the background host's dimensions. Wrap it in presentation's
`<Background>` to place it behind the slide content:

```tsx
import { Background } from "@legend-apps/presentation";

<Background><World background quality="auto">
  <Orbs count={32} /><Fog density={0.025} /><Bloom intensity={1.2} />
</World></Background>
```

World animation time restarts on slide entry, including inside `<Background>`.
This includes drifting objects, scrolling rows, sprays and custom WGSL time uniforms.
Give related Worlds the same `id` for camera continuity across slides; ids identify
scenes, while each primitive's `id` identifies an object within that scene.

## Local builds and navigation

Use `clock="step"` to author every build's `at` keyframes from zero, including
step 0 on a new slide. Custom geometry and post-pass contexts, ambient motion,
and grain sample that same projected time. The default `clock="slide"` keeps the existing timeline
through a slide's steps. `clock="global"` also preserves the deck-wide clock
when the World is inside a `Background`.

```tsx
<World id="assembly" clock="step" buildDuration={3} advanceDuration={0.3}>
  <Box id="part" position={[
    { at: 0, value: [-4, 0, 0] },
    { at: 0.2, value: [0, 0, 0], duration: 2.8 },
  ]} />
</World>
```

`buildDuration` declares the settled endpoint in seconds on the chosen clock.
Include delays and staggered arrivals in that duration. Next navigates immediately
by default (`advanceDuration={0}`). Set a positive `advanceDuration` to opt into
finishing the current build first: it fast-forwards to the endpoint over that
many seconds with smoothstep, then navigates. Repeated Next presses during
catch-up coalesce into one advance. Back or another navigation
cancels the queued advance. All frame sampling stays on the UI thread; pausing
freezes catch-up with the presentation clock.

With `buildDuration`, Back starts at that endpoint by default. Set
`replayOnBack` to replay from zero instead. Ambient motion can continue after
the endpoint. Preparation still samples zero; thumbnails use `previewTime`, which defaults to `buildDuration` so they show the settled frame.
Without `buildDuration`, navigation keeps its existing immediate behavior.

For step-local scenes, earlier step-triggered tracks are settled and the current
step starts at zero. Author each build's `at` baseline as the previous build's
endpoint so catch-up can hand off without a jump. Reuse `<World id>` and
`enter={{ from: "previous", duration: 0.5 }}` for the existing camera handoff
across slides. Keep carried parts in both scenes with the same ids and resting
positions; the local clock does not remove or relocate them. Camera entry does
not replay on each step. See `apps/slides/examples/3d/world-steps.mdx` for a
small two-slide deck with local builds and carried geometry.

## Worlds and camera shots

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
Without an authored `buildDuration`, backward navigation restarts the selected step's scripted transition.
Keyframe tables and graph activation are sampled in a UI worklet into one storage
uniform array. This keeps frame work off JavaScript, but uniform evaluation and
upload still scale with the instance count; the graph API targets 20–60 nodes.

The pipeline is an instanced HDR scene with depth,
height fog and volumetric lights, depth of field, a half-resolution bloom mip
chain with a soft threshold knee and round 13-tap/tent filters, chromatic aberration, ACES exposure/tonemapping, sRGB encoding, vignette
and grain, then FXAA. The drawable is backed at device pixels. `high`, `medium` and `auto` render
the scene through 4x MSAA colour and depth; `high` and `auto` use full-resolution scene targets and five
bloom levels. `medium` uses 0.85 scene scale and five levels; `low` uses 0.65 scene
scale and three levels. Output resolution stays unchanged. `renderScale` is a
static multiplier greater than zero and at most one for every offscreen target.
It combines with the preset and the per-effect scales; it does not rebuild pipelines.

`auto` starts each slide with the high preset and adjusts an additional multiplier from 1
down to 0.75 in 0.125 steps. It samples live playback callback intervals, waits
through startup and resizing, lowers resolution only after sustained intervals above
25ms (a collapse below ~40 fps), and requires several healthy windows before raising it. Paused and
outgoing frames keep the last live scale; preparation and previews use the
explicit static scale. A retained world may resize once when leaving preparation.
This policy changes
resolution only; camera motion and effect animation still sample the presentation
clock. Callback cadence is an indirect signal: CPU load or a low-refresh display
can also trigger reductions, and a GPU backlog may not immediately affect it.
Use a fixed quality and scale for repeatable image comparisons.

For a raw WGSL escape hatch, use `GPURenderGraph` from
`@legend-apps/presentation`. `buildWorldGraph` and the pure `scene.ts` helpers
expose the same description and deterministic uniform samples for measurement.
The scene hooks below share that pipeline. All animation samples the same clock;
no frame history or per-frame React render is required.

The raw host accepts `renderScale` as a positive numeric SharedValue, defaulting
to 1. It multiplies offscreen target scales while retaining the drawing-buffer
size and compiled pipelines. Quality policy belongs to the pack.

Generate a standalone browser measurement page from the repository root:

```sh
bun packages/slides-effects/scripts/world-benchmark.mjs --output /tmp/world-harness.html
```

Open that file in Chrome with WebGPU and run
`await benchmarkWorld({ width: 1920, height: 1080, quality: "high" })` in its console.
Repeat at 3840×2160 and with each preset. Results report completed-submit frame
times and per-pass GPU timestamps when available. Throughput measurements do not
measure display refresh rate or prove a particular presentation frame rate.
Use fixed presets and `renderScale` for cost comparisons. Automatic adaptation
runs only with `paced: true` in the harness; its per-sample scale history is a
controller and callback-cadence check, rather than a steady-state cost at one resolution.


## One scene across slides

`WorldSlide` keeps a named World alive between slides. When several slides pass an identical `children` array and `track.frame: "world"`, they share one prepared scene: navigation swaps no GPU pipelines and re-sends no scene data, so a heavy scene changes slides without a stall. Parts and lights are authored in fixed world coordinates, while the camera stays local to each station.

```tsx
const scene = buildScene(); // built once
export function Chapter({ slide }: { slide: number }) {
  const step = usePresentationValue("stepIndex");
  return <WorldSlide world="talk" clock="step" stepOffset={FIRST_BEAT[slide]} buildDuration={BEAT_LENGTH[FIRST_BEAT[slide] + step]}
    track={{ frame: "world", duration: 1.7, position: [0, 3.6, 13], via: [2.5, 5.5, 22], carry: { lift: 3, spread: 3, spin: 40, stagger: 0.28 } }}>
    {scene}
  </WorldSlide>;
}
```

`stepOffset` adds to the step index, so tracks in the shared scene address a running beat with `{ step, delay, value }`. Give a part one pose per beat; the track samples the flight between them.

The rail holds still at each station and always travels forward along one continuous track; Previous retraces the same curve and banking. Departed parts hold their last pose and fade during the move; once it settles, only the selected slide's parts remain visible. Interrupted moves start from the live faded pose. Each slide's `camera` (its `track`) shapes the leg into its station:

| Field | Effect |
| --- | --- |
| `turn` | Peak heading in degrees the track swings through, −60 to 60: positive curves right, negative left |
| `rise` | World units the camera lifts at mid-travel; negative dips (it stays above the floor) |
| `spacing` | Leg length in world units |
| `bank` | Peak lean into the curve, 0–45 degrees (default 12% of `turn`) |
| `duration`, `ease` | Flight time and easing |

Unset fields use equal shares of gentle left curves, right curves and straights: two curves to one side, a straight, then two to the other side and a straight. Turns are 6–10°, spacing starts at 48 units and rises are at most 0.3 units (`frame: "world"` keeps a straight, level track). The bend happens between one station's content and the next station's camera, so settled slides stay square to the camera; the floor markings, tunnel and other fixed scenery follow it. The centreline and camera use quintic curves with continuous velocity and acceleration at joins; bank eases in and out over the whole leg. A jump across more than one slide flies the whole way in at most 1.5 s, with reduced heading lead, rise and bank to keep its gaze steady.

```mdx
<Scene id="hooks" layout="cloud" camera={{ turn: -8, rise: .15, spacing: 50, duration: 2.3, bank: 1 }} durations={[2.4]}>
```

Layouts supply the resting framing. Their legacy via controls are used by lanes and prepared scenes; a per-slide track uses only explicitly authored `camera.via` / `camera.viaTarget`.

Held step orbits unwind over the whole flight and return along the same eased motion on the reverse trip.

With station-local content, `track.fixed` accepts raw part-id prefixes (for example `["environment/", "dust:"]`) that stay in world coordinates. This keeps the environment still while matching content ids carry between stations.

`carry` shapes that flight, for any id whose pose changes on navigation:

| Option | Effect |
| --- | --- |
| `lift`, `spread` | World units that bow the path up and to one side; hops under 8 units bow proportionally less |
| `spin` | Peak tumble, in degrees |
| `stagger` | Share of the move spent waiting, varied per id |

Ids that share a prefix before `/` (`node1/body`, `node1/label`) fly as one object: their glyphs tilt with the part instead of tumbling. A part with zero scale or opacity on the next beat keeps its size and shrinks on landing, so parking it at a destination carries it there; a part hidden on the current beat appears on takeoff. Parts hidden or shown without moving swap at once. Previous mirrors each flight exactly in time.

Custom WGSL can read `continuousTime()`, which keeps running through navigation, for ambient motion that must not jump when a clock restarts.

## Materials, lights and environment

Start with one reusable material, a key light and the studio environment:

```tsx
import { World, Material, Box, KeyLight, Environment } from "slides:world/World";

<World width={1600} height={800}>
  <Material id="paint" albedo="#243047" roughness={0.5} metal={0.15} />
  <Box material="paint" position={[0, 1, 0]} />
  <KeyLight position={[-6, 10, 8]} target={[0, 0, 0]} intensity={2} />
  <Environment intensity={0.7} />
</World>
```

`albedo` is the lit surface color; `emissive` adds self-lit color and can feed bloom.
Use roughness for highlight width and metal for the metallic response. Environment
is analytic studio lighting, not an HDR image loader. Add a floor, local
lights or post effects only when the scene benefits from them.

### Focus, floor and lighting

```tsx
import { DOF, Floor, Material, PointLight, SpotLight, RimLight, Shafts, Chromatic } from "slides:world/World";

<World width={1696} height={650}>
  <Camera shots={[{ step: 0, position: [0, 4, 16], target: [0, 0, 0] }]} />
  <Material id="stone" albedo="#243047" roughness={0.6} metal={0.15} rim={0.8} />
  <Box id="subject" material="stone" scale={[1, 3, 1]} emissive={0.1} />
  <PointLight position={[-4, 5, 4]} color="#f59e0b" intensity={6} range={20} />
  <SpotLight position={[3, 7, 0]} target={[0, 0, 0]} color="#22d3ee" angle={0.4} intensity={12} range={24} />
  <RimLight color="#22d3ee" intensity={1.5} />
  <Floor y={-1.5} roughness={0.06} size={40} />
  <DOF focus={{ 0: 16, 1: "subject" }} aperture={0.6} maxBlur={12} />
  <Fog density={0.03} /><Shafts intensity={0.6} density={0.03} anisotropy={0.3} />
  <Bloom intensity={1.2} /><Chromatic amount={0.002} />
</World>
```

Focus accepts an animated distance or object id. `focusRange` is the world-space
half-width of the sharp focus band (default 0). Camera shots also accept `focus`.
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
half-float headroom for bloom. Bloom `scale` controls its render resolution
(default 0.5); smaller values spread the halo farther with fewer pixels.
At most four local lights are supported. `RimLight`
adds a shared view-dependent rim color/intensity, including on dark materials.

Spheres, orbs and spray use six-vertex analytic spheres with curved normals,
nonuniform scale and surface depth. Emissive spheres have a bright round center
and radial falloff; bloom supplies the surrounding halo. Emission contributes
HDR radiance but does not automatically create a local light. Place a point light
near an emissive subject when it should illuminate nearby surfaces.

The floor is a lit, non-reflective plane; the regular fog stage fades it into the scene.

DOF uses a half-resolution gather and depth-aware composite. Shafts integrate
point/spot scattering along the visible camera ray at half resolution.
Interleaved-gradient jitter avoids synchronized integration bands, and fog applies them
through a 3x3 tent filter so the jitter never shows as grain.
Static `scale` overrides are available on DOF and
Shafts; DOF and Shafts also accept `samples`. These change pipeline topology.
Animated focus, aperture, blur radius, lighting and effect strengths update uniforms.

## Key light, environment, floor markings and tunnels

```tsx
import { KeyLight, Environment, Floor, Tunnel } from "slides:world/World";

<KeyLight position={[-10, 14, -8]} target={[0, 0, 0]} intensity={2.4} shadowSize={12} softness={2} />
<Environment intensity={0.9} />
<Floor y={0} color="#0a0a0c" size={200} grid={{ spacing: 2 }}
  lines={[{ x: 9, width: 0.12 }, { x: 3, dash: 1.5, gap: 1.5, intensity: 0.2 }]}
  kerbs={[{ x: 9.4, width: 0.8, stripe: 1.6, colors: ["#808080", "#ff3b30"] }]} />
<Tunnel from={[0, 0, 18]} to={[0, 0, -110]} spacing={8} width={24} height={11} />
```

`KeyLight` is a directional light from `position` toward `target`, using the same
GGX response as point lights. By default it renders a shadow map: boxes, rings,
tubes, custom geometry and spheres cast (spheres as light-facing discs), and the
same shapes and the floor receive. The square shadow box is `shadowSize` half-width
around `target`, widened to the canvas aspect. `softness` is the penumbra in
shadow-map texels, filtered with a tent-weighted 5x5 PCF (skipped when the kernel's
corners and center agree) and a slope-scaled bias;
`shadowStrength` is the fraction of key light removed in shadow. `shadowScale`
(default 0.5) sets the static map resolution relative to the scene target. Cards,
labels and SDFs do not cast. `shadow="contact"` replaces the map with a short
screen-space march toward the light that darkens the lit image where the depth
buffer blocks it; `shadow={false}` lights without shadows. Position, target,
color, intensity, shadow size, softness and strength animate.

`Environment` adds image-based lighting from a small analytic studio: soft boxes
over a dark gradient, widened by roughness with conserved energy in place of a
prefiltered map, and an analytic split-sum response. Metal and glossy sides pick
up highlights without extra lights. Its intensity animates.

Floor markings are static and run along z: `lines` at `x` (mirrored to `-x` unless
`symmetric={false}`), solid or dashed (`dash`, `gap`); `kerbs` alternate two
colors in `stripe`-long blocks from `x` to `x + width`; `grid` draws faint
antialiased cell lines. `intensity` scales each marking color. `lit={false}` keeps
scene lights off the floor; key shadows still apply.

`Tunnel` places a portal frame (two posts and a beam in dark metal, or `color`
and `material`) every `spacing` along `path`, an axis-aligned polyline, or from
`from` to `to`. Between frames it adds emissive `strips` under the beam and low
`edges` along both walls; pass `false` to omit either. `tunnelInstances` returns
the boxes for custom scenes. The `lighting.mdx` deck shows each feature.

### Track touches

A tunnel adds light rigs to every second frame by default: `lights={{ every, count, color, intensity, chase, streak }}`
places `count` lamps on each post's inner face, chasing down the tunnel at `chase` (0 holds them steady) and
stretching `streak` world units along the path at peak travel speed; `lights={false}` omits them. A floor with
`lines` or `kerbs` paints a checkered start line at `start.z` (default 0) with `rows` staggered grid slots
behind it; `start={false}` omits it. Dashes, kerbs and the start line smear `motionBlur` world units along z at
peak travel speed (default 2.5; 0 keeps them sharp). `speedTrails(length, { stretch, boost, accent })`
lengthens and brightens its streaks with speed.

On a station track, ids starting with a `fixed` prefix (default `["tunnel:", "trails:"]`) keep their world
coordinates, so the camera flies past them between stations; `fixed: []` carries every part with its station.
`blur` (default 1, 0 off) sets a radial motion blur toward the frame's centre at peak travel speed. Custom WGSL
reads that speed, 0 at rest to 1 at the move's peak, as `travelSpeed()`.
To calm the scenery while a slide holds, `heldMotion` (0–1) slows `continuousTime()`, which drives trails and
tunnel lights, to that share of full speed, and `heldBlur` widens the DOF blur radius by that share of `maxBlur`.
Both ease back to full motion and base blur with travel speed, so only camera flights run at full speed.
`depthFade` (world units, default 0 off) keeps everything up to that far past the camera target at full brightness,
then fades lit scenery, lights and the floor toward black in their own shaders, so the background behind content
stays calm and distant lamps fade instead of speckling; `heldFade` (0–1) steepens that falloff while a slide holds.
Prefer them over `heldBlur`, whose wide DOF gather breaks small bright lights into speckles.

```tsx
import { Stoplight } from "slides:world/World";

<Stoplight position={[0, 4.4, 0]} size={0.42} lights={[
  { color: "#ff2d2d", glow: { 0: 6, 1: 0 } }, "#ffb020", { color: "#2dff7a", glow: { 0: 0, 1: 7 } },
]} />
```

`Stoplight` is a housing of lamps in a row facing +z, left to right; the default five run red, red, amber,
green, green. Each lamp is a color, or `{ color, glow }` where either animates and glow 0 is off. `size` is the
lamp diameter, `glow` the default lamp glow and `housing` its color. Bloom supplies the halo.
`apps/slides/examples/3d/world-track.mdx` shows each touch.

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
The head is a round emissive orb of radius `size`. Its thinner trail uses 18%
of that radius and 30% of the head's emissive intensity so the orb stays distinct.
Both follow the graph's curved edges. The trail restarts at each node so one tube
never cuts across a junction. Ambient Spray accepts
`position`, `spread`, `velocity` and `seed`; `under="leaves:lit"` emits beneath
active leaves. Motion, birth and lifetime are analytic samples of absolute time.

Rows keep a fixed instance pool while logical row ids advance with the clock.
Listed changes flash on entry, then stay in `flashColor` with a steady glow while
the other rows dim; recycled slots do not inherit a previous row's highlight.
A `recycle` pool sends the slot leaving the top around to the bottom; `recycle.glow` scales its accent.
Use `rows:row:4` to follow or focus logical row 4 while it is visible.
`width`, `depth`, `start`, `flashDuration` and `position` configure the column.
Stages offset nested primitives and multiply their glow. Stage positions and glow
can be animated. `wave={{ bob: [.1, 4], orbit: [.07, 7], pulse: [.2, 3], lag: .3 }}` keeps a
Stage moving on the slide clock: each entry is `[amplitude, period in seconds]`; `bob` rises and falls,
`orbit` circles in the ground plane, `pulse` scales glow by 1 ± amplitude, and `lag` delays all three.
With `step` (and `delay` seconds), the Stage holds still until then and the wave eases in over a second.
Lights and the floor remain world-space settings even when
nested in a Stage. `flyTo` targets `stage:<id>` with a deterministic eased transition;
use that explicit prefix when following a stage directly. An eased flight is the
default; a positive `arc` adds vertical curvature to the transition.

## Cards

```tsx
import { Card } from "slides:world/World";

<Card id="ada" position={[0, 1, 0]} scale={[4, 0.66, 0.18]} material="glass" color="#22d3ee"
  title="Ada" subtitle="Lovelace" meta="key 1" />
<Rows id="pool" height={0.66} card={{ radius: 0.16, avatar: 0.62 }} labels={[{ text: "{initial}", align: "center" }]} />
```

A Card is a flat rounded glass panel facing the camera: `scale` is its full width,
height and depth (the panel sits on the front face). `radius` rounds its corners,
`edge` scales its thin rim and glow, and `glow` is the blur width of the soft outer
glow. `fill` (0 to 1, default 1) is the body's opacity under the rim and glow, so
a translucent plate can back text without hiding the scene. At rest (`emissive` up to 0.03) a card is dark slate glass with a dim slate rim
and avatar; an `emissive` of 0.09 or more lights it in `color`: tinted fill, rim,
avatar and a faint glow. Card colors are display colors, as a 2D layer would draw
them, mapped back through the tonemap. A card with a `title` shows an avatar
(`avatar` is its radius as a fraction of half the height; 0 hides it) with the
title's initial or `initials`, then the title and an optional `subtitle`, plus a
right-aligned mono `meta` tag. Text sizes follow the height; `opacity` fades the
text and `titleOpacity` the title alone. Rows take the same shape through `card`;
their label templates add `{initial}`. Each card is one quad shaded from a 2D
rounded-rectangle distance field, antialiased per device pixel, so edges stay crisp
at Retina sizes without MSAA.

## Label fonts

`Label`, card titles and `Rows` label templates accept `weight="regular"`,
`"medium"` (default), or `"bold"` for Roboto 400/500/700. Card subtitles use regular
and avatar initials use bold. `mono` selects JetBrains Mono Regular with its real
0.6 em advance and outlines; `weight` applies to the proportional face only.
Both fonts use the SIL Open Font License 1.1; full notices ship in
`font-licenses.json` alongside the generated atlas.

```tsx
<Label text="Vector labels" weight="bold" size={0.4} />
<Label text="items.map(render)" mono size={0.25} />
```

Printable ASCII uses vector-generated RGB MSDF at 40 px/em with an 8 px distance
range. Layout and drawing share advances and GPOS kerning extracted from the
font. Unsupported characters become `?`; labels retain the 57-character limit.
The shader bilinearly filters the linear RGB channels before median decoding,
then computes coverage from fragment derivatives in render-target pixels.
Camera motion never snaps glyph positions. Scene depth, fog and post effects
still apply, so depth of field can intentionally blur out-of-focus text.

Atlas generation is a build-time tool, with no generator or font-file dependency
in the application. The generated `glyphs.ts` is part of the installable World
source pack. It uses lossless RGB run packets decoded once per runtime; GPU
buffers also contain face metrics and pair kerning. To regenerate, install
`msdfgen-wasm@1.0.0` in a tools directory and `fonttools` plus `uharfbuzz` in a
Python environment, then run from the repo root:

```sh
NODE_PATH=/path/to/tools/node_modules FONTTOOLS_PYTHON=/path/to/venv/bin/python \
  node packages/slides-effects/scripts/world-glyphs.cjs \
  /path/to/JetBrainsMono-Regular.ttf /path/to/JetBrainsMono-OFL.txt
```

The proportional source is `packages/slides-web/assets/Roboto.ttf`; monospace
inputs are from [JetBrains Mono v2.304](https://github.com/JetBrains/JetBrainsMono/tree/v2.304).
Keep the generated source and notices together when rebuilding or installing a pack.

## 3D text

```tsx
<Text3D id="title" text={"EVERY LETTER\nMOVES ON ITS OWN"} position={[0, 1.2, 0]} size={1.25} depth={0.26}
  color="#f2f4f8" emissive={0.75} side="#2a2c31" metal={0.85} roughness={0.32}
  enter={{ at: 0.3, offset: [0, 0.4, 9], spread: [10, 4, 4], rotation: [-40, 70, 25], scale: 0.4, stagger: 0.045, order: "random" }} />
```

Extruded, beveled type. Each visible glyph is its own instance (`<id>:<index>`), so it moves, turns, scales
and glows on its own, yet every glyph of one font draws in a single instanced pass. `size` is the em in world
units; `depth`, `bevel` (thickness) and `bevelWidth` are in em, and `bevelSegments` rounds the bevel. The face
uses `color` and self-glow `emissive`, so type stays readable under the bloom threshold; the sides and bevel
use `side`, `metal` and `roughness` (or a `material`) with soft studio lighting. `align`, `lineHeight`,
`tracking` and `uppercase` shape the layout; `\n` breaks lines and unsupported characters become `?`.
`position` is the cap-height center of the first line, so type sits optically centered on a box at the same
point; each further line is `lineHeight` em lower.

`enter` flies glyphs in from `offset`, `rotation` (Euler degrees) and `scale` on `step` or slide time `at`, one
every `stagger` seconds in `forward`, `reverse`, `center` or `random` order, with `spread` adding seeded
scatter. `glyphs` (an array, or `(index, char, home) => motion`) sets per-glyph `offset`, `rotation`, `scale`,
`color`, `emissive` and `opacity` tracks and overrides `enter`. `text3dInstances` and `layoutText3D` expose the
same instances and em layout for custom choreography.

The default font is Barlow Condensed ExtraBold Italic and `mono` selects JetBrains Mono Bold (both SIL Open
Font License 1.1; the notices ship in `text3d-font.ts` and `text3d-mono.ts`). Bake another font, for example in a private deck, with a build-time tool: install
`opentype.js@1.3.4` and `earcut@3.0.1` in a tools directory, then run from the repo root

```sh
NODE_PATH=/path/to/tools/node_modules node packages/slides-effects/scripts/world-text3d.cjs \
  /path/to/Font.ttf /path/to/LICENSE.txt /path/to/deck/my-font.ts "My Font"
```

and pass the module's export: `import { font } from "./my-font"` then `<Text3D font={font} … />`. The module
stores flattened outlines, shading normals and cap triangles; the shader builds caps, bevels and sides, so depth
and bevel stay runtime options. Only bake fonts whose license allows redistribution with the deck.

## Render trees

```tsx
import { RenderTree, tree } from "slides:world/World";

<RenderTree data={tree("app", [["list", ["a", "b"]], "footer"])} flashes={[undefined, "all", { subtree: "list" }, ["b"]]}
  labels={{ app: "App" }} position={[0, 1.6, 0]} spacing={[2.3, 1.75]} card={[2, 0.56]} total={{ position: [7, 1.4, 0] }} />
```

Solid rounded nodes in one plane, laid out with leaves in consecutive columns.
Each `flashes` entry is `"all"`, a list of ids or `{ subtree: id }`. Nodes and their
edges pulse in `color` top-down on the steps where they render, then settle to a faint
glow and dim again on the next step without a render. Each node shows its accumulated
render count; `total` places the running sum. Counts crossfade between steps; for a
ticking total, overlay the charts pack's `AnimatedNumber`. Instance ids are
`<id>:<node>` (default id `tree`).

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
invalid. A hook after tonemapping moves that stage into an offscreen target, so
its grain size follows the target resolution. Additional `reads` follow the fixed previous/depth/HDR texture bindings
at group 0 binding 6 onward; declare their WGSL bindings explicitly. Raw
`GPURenderGraph` exposes the full resource/pass contract.

## Writing a custom TypeGPU effect

`defineWorldEffect` declares a reusable multi-pass effect with typed, animatable
params. Params are a TypeGPU struct (`d.f32` or `d.vec3f` fields); the pack
writes their sampled values after the instance data and generates the matching
WGSL `struct` and `params()` loader from the same schema, so TS and WGSL cannot
drift. The built-in DOF and bloom are defined the same way.

```tsx
import { d } from "typegpu";
import { defineWorldEffect, Effect, type WorldEffectGraph } from "slides:world/World";

const depthTint = defineWorldEffect({
  name: "depth-tint", params: { amount: d.f32, tint: d.vec3f }, defaults: { amount: 0, tint: "#3b82f6" },
  build: ({ input, id }): WorldEffectGraph => ({ passes: [{
    id: id(), fragment: "main", reads: { source: input, depth: "depth" }, output: id(),
    wgsl: `@fragment fn main(@location(0) uv:vec2f)->@location(0) vec4f {
      let p=params(); let color=textureSampleLevel(source,linearSampler,uv,0.).rgb;
      return vec4f(mix(color,p.tint,p.amount*smoothstep(0.,40.,depthAt(uv))),1.);
    }` }] }),
});
<Effect use={depthTint({ amount: { 0: 0, 1: 0.8 } })} after="bloom" />
```

`build` runs once per pipeline topology with `input` (the incoming color
target), static `options`, `quality`, `scale`, `samples`, `levels` and `id(name)`,
which namespaces pass and target ids (`id()` is the effect name; a repeated
effect becomes `name-2`). Each pass names its texture bindings in `reads`:
`depth: "depth"` binds linear depth through `depthAt(uv)`, any other entry binds
`texture_2d<f32>`. `frame`, `uniforms`, `linearSampler` and the camera helpers
are in scope. Declare reduced-scale or mip targets in `targets`; other
intermediate outputs get a full-resolution target, and the last pass becomes the
stage color. An effect returning `add: { source, gain }` instead adds `source`
times the param `gain` onto its input; when it is last before tonemapping the
add folds into the tonemap. Placement matches `Pass`: one `before` or `after`
stage, defaulting to the definition's `after`, then `bloom`. The second argument
to an effect, `glow(values, options)`, carries JSON options that select topology.
Param values accept constants, step maps or keyframes; they change no pipeline.
See `apps/slides/examples/3d/world-effects.mdx`.

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
`cinematic-title.mdx` combines a glossy floor, lit monoliths, volumetric fog,
drifting particles and continuous camera moves behind normal text overlays.

## Parts, assembly and landing events

`Choreography` moves reusable instance templates between layouts on the presentation
clock. A part has an id, local `instances`, and a `home` pose (`position`, optional
Euler XYZ `rotation` in radians, `scale`, and `color`). Use `primitive`,
`cardInstances`, or custom mesh instances to build the templates.

```tsx
import { Choreography, primitive, type ChoreographyPart } from "slides:world/World";

const part = (id: string, x: number): ChoreographyPart => ({ id, home: { position: [x, 0, 0] },
  instances: [primitive("box", { scale: [1, 0.6, 0.4] })] });
<Choreography id="assembly"
  layouts={[{ id: "pair", parts: [part("a", -2), part("b", 2)] },
    { id: "base", parts: [part("c", 0)] }]}
  transitions={[{ from: "pair", to: "base", step: 1, duration: 1.4,
    stagger: 0.06, swapAt: 0.55, overshoot: 0.08,
    onLand: { count: 18, seed: 9 } }]} />
```

Transitions form an itinerary. Each uses a `step` or absolute slide-time `at`.
The default mapping pairs cyclically up to the larger layout's count. Explicit
`mapping: [{ from, to, via?, delay?, swapAt? }]` must cover all parts; repeated
sources split and repeated targets merge. `via` contains two absolute cubic
control points; default handles rise from departure and approach along depth. `swapAt`
selects source or destination geometry at raw normalized flight progress.
Each staggered flight travels, pushes past its seat, and settles exactly home.
During a merge, the earliest arrival owns the destination geometry; extra
incoming sources shrink away after the swap point instead of duplicating it.

`onLand` emits a seeded, one-shot burst at each route's destination. Standalone
`<Burst position={[0, 0, 0]} step={1} delay={0.5} count={24} seed={7} />` uses
the same event clock. Burst style supports `lifetime`, `color`, `size`, `speed`,
`spread`, and `gravity`. Events are sampled effects, without JS callbacks or a
particle frame loop, so seeking backward or sampling a still reproduces the frame.

Templates use their initial local positions; home poses own rigid motion. Meshes
and card bodies rotate in 3D; atlas `Label` strings retain their facing plane.
Use glyph meshes for rigid 3D type. `apps/slides/examples/assembly.mdx` demonstrates
18 tiles arriving on rails, merging into seven nodes, then three bases. Use
`quality="high" renderScale={1}` for device-resolution proof.

## Camera paths and stage geometry

Shots also accept `via: Vec3[]`, a smooth interpolating path through world-space
points between the prior pose and the destination. `crane: { height, pullback }`
adds a mid-move rise and retreat; both vanish at the endpoints. After settling,
`idle: { position: [0.14, 0.05, 0.08], target, speed: 0.2 }` adds a gentle bounded
drift. Amplitudes are world units, speed is radians per second. These effects
use the shot's existing `step` or slide-clock `at`; reverse navigation resamples
without accumulating motion.

`RoundedBox` takes the usual primitive props plus `radius` and `edge`. Its full
size defaults to `[2, 0.7, 0.35]` through `scale`. The front, back and rounded
sides are lit solid geometry; `edge` adds the familiar card rim highlight.

`RoutedTube` takes `id`, a `path` of world-space points, `thickness`, `color`,
`emissive`, and animated `draw` coverage from zero to one. Coverage and pulses
advance by total path length, including across bends. `pulses` is a list of
`{ step, at, delay, duration, color, size }` events; all timing is in seconds.
Pulse beads use a fixed instance pool and disappear after arrival.

`RenderTree` uses solid rounded nodes and orthogonal routes by default. Existing
flash selections still work. A typed flash is
`{ nodes: ["Model", "Store"], type: "update" }`; `nodes` also accepts `"all"`
or `{ subtree: "Model" }`. Use `flashColors={{ render: "#ff704d", update: "#a78bfa" }}`
or a flash's explicit `color` to select its flare/pulse color. Node `depth` and
`radius` control the solid shape. `draw` animates route coverage; `routing="direct"`
uses straight edges, and `pulses={false}` disables traveling signals.
`pulseDuration` is the time per tree level (default 0.14 seconds), so each pulse
arrives at the destination node's flash peak.

`Pillar` takes a unique `id`, a nonnegative `value`, optional `from` (zero),
`maximum`, `height`, `width`, `depth`, floor-anchor `position`, `color`, `label`
and `counterSize`. `step` or `at`, `delay`, `duration` (default 1.6 seconds) and
`ease` (default `smoothstep`) drive one shared numeric track. Column height is
`height * clamp(value / maximum, 0, 1)`; the extruded integer counter rides on
its top and rounds that same sampled value. Values above `maximum` retain their
counter while height saturates. Digits are fixed-width seven-segment meshes,
with no per-tick geometry allocation. See `apps/slides/examples/stage.mdx`.

`partsFromInstances(instances)` converts existing mesh arrays into independent
parts at their original centers, including Text3D glyph arrays. It sets each
part's `origin` to that center so its rail, rotation pivot, and landing burst
share the same home. Explicit groups default to local origin `[0, 0, 0]`.

### Color output

World/scene accepts `toneMapping` (`"aces"` for the existing fit, `"neutral"`,
`"aces-filmic"`, or `"agx"`), `exposure` (default 1), `emissiveScale` (default 1),
and `outputColorSpace` (`"srgb"`, the default, or `"linear-srgb"`). The three new
operators match three.js r180 in linear sRGB; ACES Filmic includes its 1/0.6
viewing-environment scale. They apply vignette and grain before tonemapping and
output encoding. The default preserves the existing display-space finish.

`Bloom` accepts animated `intensity`, `threshold`, and `radius`. Its default
`mode="soft"` retains the existing max-channel soft knee;
`mode="unreal"` selects the UnrealBloom luminance high-pass (0.01
smoothing width) without subtracting the threshold from the HDR highlights. Its
radius blends the five mip weights from `[1, .8, .6, .4, .2]` toward their
mirrors about .6, matching UnrealBloomPass without adding render passes.

`Floor.emissive` (animated, default 0) adds self-lit floor color before
shadows, fog and bloom, for painted or luminous surfaces. It also follows
`World.emissiveScale`.

Pillar accepts `material` for its body and `capEmissive` (default 5). Routed-tube
pulses accept head `emissive` (default 5) and `trailEmissive` (defaults to the head). Burst accepts
`emissive` (default 12) and a repeating `colors` palette. Tunnel `strips` and
`edges` accept a `material`; a black albedo removes their diffuse lighting while
retaining emission. These controls leave the default materials unchanged.

## Performance tips

- Keep one World for related builds when possible. Retain its scene children in
  deck-local TSX; rebuilding thousands of tracks on every key press costs JS work.
- Use `Rows`, `Orbs`, `Text3D` and part templates for instancing. Fewer objects and
  shorter tracks reduce UI-thread sampling and uniform uploads as well as GPU work.
- Bake complex choreography once; sample it with tracks or WGSL. Do not animate
  with JS timers, React updates or a per-frame JS uniform loop.
- Start with DOF disabled. Add it, shadow maps and custom passes
  individually; each can add offscreen work. Reduce DOF scale/samples, bloom scale
  or SDF march steps before compromising legible text.
- Use a fixed quality and render scale for comparisons; `auto` can change resolution
  during playback. `renderScale={0.75}` reduces target pixel count to about 56%.
- Check the actual fullscreen audience at its display resolution. Native audience
  present cadence measures presentation delivery; browser throughput, preview fps
  and video capture cadence answer different questions. Compare the same scene,
  build mode and effects before attributing a slowdown.

The source examples `world-steps.mdx`, `world-effects.mdx`, `assembly.mdx` and
`lighting.mdx` under `apps/slides/examples/` cover timing, custom effects, parts and
lighting. When copying an example, keep its local TSX/assets and effect pack pins.

`<World msaaSamples={1}>` disables MSAA without changing render or post-effect scales; `msaaSamples={4}` forces 4× MSAA. FXAA remains enabled. Omitting `msaaSamples` preserves the quality preset.

## MDX scene authoring

`slides:world/Authoring` exports `Scene`, `Headline`, `Quote`, `CodePanel`, `List`,
`Tree`, `Counter`, `Rule`, `Bars`, `Editor`, `Keys`, `Grid`, `Form`, `CodeMorph`,
`CodeTrace`, `Cloud` and `Layers`. Each slide declares its own
composition. Name a layout and the parts place themselves:

```mdx
<Scene id="flow" world="journey" layout="track-left" durations={[6]}>
  <Headline id="title">One change</Headline>
  <Headline id="caption">THE WHOLE TREE</Headline>
  <Tree id="tree" nodes={[{ id: "App" }, { id: "List", p: 0 }, { id: "Detail", p: 0 }]} />
  <Counter id="renders" label="RENDERS" value={3} />
</Scene>
```

| Layout | Slots, in fill order | Use |
| --- | --- | --- |
| `lead-in` | none | An empty hold before the first station |
| `statement` | `line1`, `line2`, `kicker`, `rule` | Large centered lines |
| `title-list` | `title`, `quote` | A title over a scrolling list, then a quote |
| `title-panels` | `title`, `quote` | A title and quote, then a pair of panels |
| `track-left` | `title`, `subtitle`, `note`, `tree`, `stat1`, `stat2` | Heading top left, tree, stats top right |
| `track-left-high` | as `track-left` | The same, flown into from high above |
| `code-panels` | `left`, `topRight`, `bottomRight` | Three code panels |
| `title-bars` | `title`, `note`, `bars` | A heading over a row of floor bars |
| `title` | `line`, `kicker`, `rule` | One large centered line |
| `statement-wide` | `line1`, `line2`, `rule` | `statement` from further back, for longer lines |
| `keys` | `title`, `keys` | A heading over a keyed list |
| `tree-wide` | `title`, `subtitle`, `tree` | A five-level tree laid out by leaves |
| `tree-tour` | `title`, `caption1`–`3`, `tree1`–`3`, `legend1`–`3` | Three trees side by side, 9.6 apart |
| `code-grid` | `code`, `grid` | Code on the left, a grid of cells on the right |
| `code-center` | `code` | One centered code panel |
| `morph` | `morph` | A tall centered morphing code panel |
| `form` | `form` | Panels of fields |
| `cloud` | `cloud` | Words at depth |
| `trace` | `title`, `trace` | Traced code on the left; its tree forms on the right |
| `layers` | `title`, `code`, `layers` | A line of code beside stacked layers and a meter |

A part takes the next free slot of its kind. `slot="kicker"` picks one by name, and
any explicit prop, including `at`, wins over the slot. A layout's camera is merged
under the `camera` prop. `defineSceneLayout(name, { camera, slots })` adds or
replaces a layout for a deck. An unknown name throws, except in a `prepare` scene,
where `layout` may stay a label the deck reads itself.

`at` is local to its station. Raw World geometry and nested `Stage` groups work
alongside these parts, so rows, columns and free placement use the same coordinate
system. Repeat an id in the next scene to carry its geometry along the shared World
track. Text `size`, `depth` and `track` are world units; `delay` and `duration` time
its entrance. `expandScene(parts, layout)` gives the same World children for a plain
`World`, and `speedTrails(length)` returns a streak effect for one.

```mdx
import { Scene, Headline, CodePanel } from "slides:world/Authoring"
import { Card } from "slides:world/World"

<Scene id="source" world="journey">
  <Headline id="title" at={[-4,5,0]}>A small example</Headline>
  <CodePanel id="example" at={[-4,3,0]}>

~~~tsx
const value = 42;
~~~

  </CodePanel>
</Scene>

---

<Scene id="column" world="journey">
  <Headline id="title" at={[0,6,0]}>The same object</Headline>
  <Card id="example/card" position={[0,2,0]} scale={[1,4,1]} />
</Scene>
```

`camera` accepts the normal World track options. `durations` gives build lengths
in seconds, one per step. `Tree nodes` uses stable `id`, optional `label` and
`color`, and a parent index `p`; children fan out around their parent, and `x`, `y`,
and `d` override that. `List items` supplies row data. `Counter label` and `value`
supply its text. `Bars items` takes `label`, `value` and `color`. `Editor` takes
`name`, `email`, and a `labels` array. A `beat={{ start, every, count }}` ticks a
`Counter` (by `per`) and sends a pulse down each `Tree` edge on that schedule.
Scene `colors` and `ambient`, camera easing, part `enter`, `exit` and `carry`, and code and
chart style props are listed with their defaults in `docs/slides-scene-props.md`.

Every step keyframe in these parts addresses the scene's own steps, so give the
`Scene` `clock="step"` and one duration per step:

- `Tree width` lays children out in proportion to their leaves; `levelHeight`, `nodeWidth`
  and `labelSize` size it. `flash={[{ step, color, ids }]}` lights `ids` (default all)
  in a wave down the levels, `hop` seconds apart, with pulses on the edges. With
  `wave: false` and `from`, they light at once from beams out of `from`. `flash: false`
  recolors without a flash; `repeat` and `every` replay it. Set `repeat: "infinite"`
  to keep node flashes and travelling pulses looping while playback is active.
- `Keys keys next` shows a keyed column. On `diff` (step 1) a copy splits off showing
  `next`, with shared keys linked and added and removed keys colored; on `recycle`
  (step 2) the copy flies away and the removed key's container travels behind the
  column into the added key's slot.
- `Keys keys viewport` frames the first `viewport` keys and dims the rest. On `scroll` the keys move up a row; on `window` the column steps left and a second frame comes out holding only the keys then in view, linked to their originals; on `recycle` the key that left the top travels behind the column into the entering slot and takes its key. With both, `recycle` follows `window`: the second frame flies away and the column recenters first.
- `Grid count columns label` flashes its cells `flash={{ step, rate, duration }}` times a
  second while a resize handle drags its frame. `flash.repeat: "infinite"` loops both. `resize: "height"` drags the bottom edge instead of the right.
  `chrome: "mac"` adds a title bar with the three window buttons; `fill` (default .15) is the window body's
  opacity and `border` its rim strength.
- `Form panels typing` shows panels of fields with render-count badges.
  `typing={{ step, bind, text }}` types into the fields bound to `bind`, ticking their badges
  and flashing them on each keystroke. `typing.repeat: "infinite"` repeats the typing
  sequence after a short hold, resetting the bound values and badges together.
- `CodeMorph` takes one ```` ```diff-tsx ```` fence per step after the first, each starting from
  the previous result. Use `diff-<language>` for other languages; plain `diff` defaults to TSX.
  Matching tokens carry over with their syntax colors; changed tokens fade out and in.
  Only deleted lines are struck through. `highlight={{ color: "#be91ff", opacity: .12 }}`
  sets the soft background bands on changed lines.
- `CodeTrace source reads pass nodes` marks where state is created, passed and read on
  `mark`, collapses the other lines on `collapse`, and lifts the source and reads into a
  tree of `nodes` labels on `extract`, with continuously repeating edge pulses.
- `Cloud words focus zoom` floats words at depth. Each step brings its `focus` words to
  the front under depth of field; `zoom` defocuses everything else on that step.
- `Layers count label value meter` nests one more translucent layer around `value` per step,
  each landing with a flash and sparks, dims the value under each layer and fills the meter to the
  given fractions, later and slower on each step. Layer k takes `colors[k]` (default link, highlight,
  hot, accent). Landed layers keep moving: `bob`, `orbit` and `pulse` take an amplitude or
  `[amplitude, period]`, and each layer trails the one inside it by `lag` seconds.
  With `words`, Layers shows its fenced code line at `size` (default .6), syntax colored and centered,
  and layer k is a box hugging the k-th of `words` left to right, labeled above; once its box lands
  the word moves with it.
- `CodePanel marks={[{ text, step }]}` highlights each occurrence of `text`, and
  `anchor: "center"` centers the panel on its position.
- `CodePanel border` sets the panel's rim strength (default .3). Code parts color from the
  compiler's syntax tokens, so their child must be a fenced block; a string child is an authoring error.

A track's `steps` move the camera within a station, by step index:
`camera={{ steps: { 2: { orbit: 30 }, 4: { dolly: .6, fov: 48 } } }}`. `orbit` turns the
camera about its target in degrees, `dolly` scales its distance, `shift` moves both and
`fov` sets the field of view, eased from wherever the camera is over `duration` seconds. Layouts
hold no step moves, so each slide declares its own.

For a fully choreographed deck, `Scene prepare` is an optional MDX-exported
function receiving every scene declaration without mounting future slides. It
returns one immutable World descriptor array, running step offsets, build
boundaries and cameras. This allows pre-baked glyph motion and shared topology
across navigation, while keeping all layout and choreography in the MDX.
`createTimeline` samples and thins numeric, vector and color trajectories at
preparation time; playback still runs on the shared UI clock. `createTypography`
accepts a font-metrics map for decks that need individual glyph positions.
