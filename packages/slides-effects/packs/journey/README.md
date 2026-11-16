# Journey

Journey is a 3D scene effect pack for Legend Slides. You declare cameras, geometry, lights and
post effects as MDX elements, and the pack renders them with WebGPU. Every frame is sampled
from the presentation clock, so scrubbing, going back and exporting all produce the same image.

## Getting started

Journey is a source pack, not an npm package. Create a `.mdx` deck and open it in Legend Slides;
if Journey is missing, install the pack the app offers. Keep the generated
`<deck>.effects.lock.json` beside the deck so the pinned pack works offline. See
[pack installation and local development](../../README.md).

Import everything from `slides:journey/Journey`, in MDX or in deck-local TSX. This deck has one
slide with two steps. Advance once to move the box and the camera:

```mdx
---
title: A short journey
width: 1920
height: 1080
transition: none
---

import { Journey, Camera, Box, Bloom } from "slides:journey/Journey"

<Steps count={2}>{() => null}</Steps>
<Journey width={1600} height={800} clock="step" buildDuration={1.5}>
  <Camera shots={[
    { step: 0, position: [0, 3, 12], target: [0, 0, 0] },
    { step: 1, position: [4, 3, 10], target: [2, 0, 0], duration: 1.5 },
  ]} />
  <Box id="part" position={{ 0: [-2, 0, 0], 1: [2, 0, 0] }}
    color="#22d3ee" emissive={0.4} />
  <Bloom intensity={0.6} />
</Journey>
```

Put cameras, geometry, lights and effects inside a `Journey`. Other React Native children are
drawn as an overlay above the canvas; keep text there or in normal slide layers. Coordinates
are world units with Y up. Times are in seconds, and steps start at zero.

To place a Journey behind the slide content, wrap it in `<Background>` and set `background`:

```tsx
import { Background } from "@legend-apps/presentation";

<Background><Journey background quality="auto">
  <Orbs count={32} /><Fog density={0.025} /><Bloom intensity={1.2} />
</Journey></Background>
```

### Journey props

| Prop | Default | Effect |
| --- | --- | --- |
| `width`, `height` | `1920`, `1080` | Size in logical slide units. Ignored with `background`. |
| `background` | `false` | Fill the background host. |
| `backgroundColor` | `"#05060a"` | Clear color. |
| `id` | | Scene identity for camera continuity across slides. |
| `clock`, `buildDuration`, `advanceDuration`, `replayOnBack` | `"slide"` | See [Clocks and builds](#clocks-and-builds). |
| `enter` | | `{ from: "previous", duration }` eases in from the last camera pose of the same `id`. |
| `previewTime` | `buildDuration`, else `4` | Time shown in thumbnails and previews. |
| `quality`, `renderScale`, `msaaSamples` | `"auto"`, `1` | See [Performance](#performance). |
| `exposure` | `1` | Animated exposure before tone mapping. |
| `toneMapping` | `"aces"` | `"aces"`, `"neutral"`, `"aces-filmic"` or `"agx"`. |
| `outputColorSpace` | `"srgb"` | `"srgb"` or `"linear-srgb"`. |
| `emissiveScale` | `1` | Animated multiplier for all emission, including the floor. |
| `postOrder` | `["fog", "dof", "bloom"]` | Order of the HDR post stages. |
| `scrim` | `false` | Darkens the scene behind overlays; `true` is `0.4`, or pass a number. |
| `borderRadius` | `0` | Rounds the canvas corners. |
| `active` | `true` | Set `false` to stop rendering. |
| `fallback` | | Shown when WebGPU cannot initialize. |

## Stops and camera travel

### Animated values

Most numeric, vector and color props accept a constant, a step map or a keyframe list:

```tsx
<Sphere position={{ 0: [-2, 0, 0], 1: [2, 0, 0] }}
  color={[{ at: 0, value: "#22d3ee" }, { at: 3, value: "#b56bff", duration: 1 }]} />
```

A step map moves to each value when that step starts. A keyframe has `value` and either `step`
or `at` (seconds), plus optional `duration` (default 0.65), `delay` and `ease`. The first value
is the baseline. Colors are `#RGB` or `#RRGGBB` and interpolate in linear light. Eases are
`linear`, `cubic` (default), `inOut`, `out`, `smoothstep`, `expo` and `spring`. Jumping straight
to a later step settles the earlier steps and animates only the current one; going back
resamples the clock, so nothing depends on earlier frames.

### Camera shots

`<Camera shots={[...]} />` takes ordered shots, each with a `step` or an `at` time. A shot
inherits anything it doesn't set from the pose at the moment it starts. Without a camera, the
view sits at `[0, 5, 18]` looking at the origin with a 42-degree field of view.

| Field | Effect |
| --- | --- |
| `position`, `target`, `fov`, `roll` | Pose. |
| `duration`, `ease` | Move timing; defaults to `Camera`'s `duration` (1.2 s) and `ease`. |
| `orbit` | `{ center, radius, speed, height, phase }`; `speed` in radians per second (default 0.12). |
| `dolly` | Distance from the target. |
| `follow` | Instance id to track, such as `node:<id>`, `orb:<index>`, `stage:<id>` or `rows:row:4`. |
| `focus` | DOF focus distance or object id while the shot is active. |
| `via` | World-space points the move passes through on a smooth path. |
| `crane` | `{ height, pullback }` lifts and pulls back mid-move. |
| `idle` | `{ position, target, speed }` adds a small bounded drift after the move settles. |

`flyTo(stageId, shot)` builds a shot that frames a `Stage`, with `offset` from the stage and a
positive `arc` to curve the flight upward:

```tsx
<Camera shots={[flyTo("b", { step: 2, arc: 4, duration: 1.5, offset: [0, 4, 10] })]} />
```

### Clocks and builds

`clock` decides what time zero means for `at` keyframes:

- `"slide"` (default): time runs from slide entry through all of its steps.
- `"step"`: every step restarts at zero, so each build is authored from zero.
- `"global"`: keeps the deck-wide clock when the Journey is inside a `Background`. Otherwise
  Journey time restarts on slide entry, including inside `Background`.

`buildDuration` is the time, on that clock, at which the current build has settled; include
delays and staggered arrivals. With it set, going back starts at the settled endpoint (set
`replayOnBack` to replay from zero), and thumbnails show the settled frame. `advanceDuration`
(default 0) lets Next finish an unfinished build first: it fast-forwards to the endpoint over
that many seconds, then navigates. Repeated presses coalesce; Back cancels it.

```tsx
<Journey id="assembly" clock="step" buildDuration={3} advanceDuration={0.3}>
  <Box id="part" position={[
    { at: 0, value: [-4, 0, 0] },
    { at: 0.2, value: [0, 0, 0], duration: 2.8 },
  ]} />
</Journey>
```

With `clock="step"`, start each build from the previous build's end pose so the hand-off
doesn't jump. Ambient motion such as drifting orbs keeps running after the endpoint.

To carry the camera between separate Journeys, give them the same `id` and set
`enter={{ from: "previous", duration: 1 }}` on the later one. Its camera eases from the last
live pose of the earlier slide. The scene `id` names the Journey; each primitive's `id` names an
object inside it. Keep shared parts in both scenes with the same ids and resting positions.

### One scene across slides

`JourneyStop` makes a slide one stop on a named Journey that stays alive between slides.
Navigation swaps the scene declaration instead of mounting a new GPU surface, and the camera
flies along a track from one stop to the next. Each slide renders its own `JourneyStop` with the
same `journey` name and a `track`:

```tsx
<JourneyStop journey="gallery" track={{ turn: -8, rise: 0.15, spacing: 50, duration: 2.3, bank: 1 }}>
  <Sphere id="exhibit" position={[0, 2, 0]} size={2} />
</JourneyStop>
```

`JourneyStop` accepts the other Journey props except `id` and `background`, which it supplies.
The [Journey design note](../../../../apps/slides/docs/journey-design.md) describes how slide
components share one Journey. Each slide's `track` shapes the leg into its stop:

| Field | Effect |
| --- | --- |
| `spacing` | Leg length in world units (default 48, or 32 with `frame: "world"`). |
| `duration`, `ease` | Flight time (default 1.7 s) and easing. |
| `turn` | Peak heading change in degrees, -60 to 60; positive curves right. |
| `turnMode` | `"swing"` (default) returns parallel after each bend; `"heading"` keeps the turn. |
| `rise`, `bank` | Mid-travel lift in world units (negative dips); lean into the curve, 0 to 45 degrees. |
| `position`, `target` | Camera pose at the stop, local to the stop. |
| `via`, `viaTarget` | Points that bend the flight's curve. |
| `course` | Legs by slide index, so stops sit on one track before they are visited. |
| `steps` | Camera moves within a stop by step: `{ orbit, dolly, shift, fov, focus, duration, ease }`. |
| `carry` | How matching parts fly between stops; see below. |
| `frame`, `fixed` | Coordinate frame for parts; see below. |

Further fields tune the look of travel: `focus` (DOF distance, default the camera target),
`blur` (radial motion blur, default 1), `heldMotion` and `heldBlur` (scenery speed and extra
blur while holding at a stop) and `depthFade`/`heldFade` (fade distant scenery to black).

Unset fields give a straight, level track. The camera holds still at each stop, and Previous
retraces the same curve. A jump across several slides takes at most 1.5 seconds. Parts that
leave fade out during the move; once it settles, only the current slide's parts remain.

By default (`frame: "station"`), content is authored relative to each stop and travels with it;
`fixed: ["environment/", "dust:"]` keeps matching id prefixes in place while the camera passes.
With `frame: "world"`, parts and lights use fixed world coordinates and the camera stays local
to each stop. Slides that pass the same `children` array then share one prepared scene, so
navigation sends no new scene data. `stepOffset` adds to the step index, so tracks in the shared
scene can address a running step number:

```tsx
const scene = buildScene(); // build once, outside the component
export function Chapter({ slide }: { slide: number }) {
  return <JourneyStop journey="tour" clock="step" stepOffset={FIRST_STEP[slide]}
    track={{ frame: "world", position: [0, 3.6, 13], carry: { lift: 3, spread: 3, spin: 40, stagger: 0.28 } }}>
    {scene}
  </JourneyStop>;
}
```

`carry` shapes the flight of any id whose pose changes on navigation: `lift` and `spread` bow
the path up and sideways (world units), `spin` is the peak tumble in degrees, and `stagger` is
the share of the move spent waiting, varied per id. Ids that share a prefix before `/`, such as
`node1/body` and `node1/label`, fly as one object. A part hidden on the next step keeps its size
in flight and shrinks on landing; a part hidden on the current step appears on takeoff.

`prepareJourneyStops(props[])` bakes stop props ahead of navigation so they share one GPU
layout. In custom WGSL, `continuousTime()` keeps running through navigation, for ambient motion
that must not jump.

## Primitives

### Shapes

`Sphere`, `Box`, `Tube` and `Ring` accept `id`, `position`, `size` (default 0.5), `scale`,
`rotation` (Euler XYZ degrees), `color`, `emissive` and `material`. `Tube` adds `end`, `curve`
and `thickness`; `Ring` adds `radius` and `thickness`. Instance ids must be unique in a scene.
`RoundedBox` adds `radius` (default 0.1), `edge` (rim highlight, default 0.6) and `gradient`
(darkens toward the bottom, 0 to 1); its default `scale` is `[2, 0.7, 0.35]`.

`Orbs` places a seeded field of glowing spheres: `count` (default 48), `colors`, `radius`,
`spread`, `position`, `seed`, `drift`, `emissive` and an `id` prefix (default `orb`). Use
distinct prefixes for several fields.

### Graphs, pulses and sprays

```tsx
import { Graph, PathPulse, Spray, tree, wave, subset } from "slides:journey/Journey";

const data = tree("root", [["a", ["a1", "a2"]], ["b", ["b1", "b2"]]]);
<Graph data={data} node={{ color: "#22d3ee", size: 0.3 }}
  activate={[wave({ from: "root", step: 1 }), subset({ branches: ["b"], step: 2 })]} />
<PathPulse id="pulse" path={["root", "b", "b2"]} step={1} duration={2.4} color="#22d3ee" size={0.08} />
<Spray under="leaves:lit" rate={40} lifetime={2} color="#22d3ee" />
```

`Graph` lays out a tree as a cone: `data`, `radius`, `levelHeight`, `position`, `node` defaults
(`color`, `dim`, `size`, `emissive`, `scale`), `edge` (`color`, `curve`, `thickness`, `glow`)
and a `nodes` map of per-id overrides. Node ids become `node:<id>`. `wave({ from, step, speed })`
lights the tree outward, with `speed` in seconds per level; `subset({ branches, step })` lights
the listed branches and dims the rest.

`PathPulse` sends an orb along a `path` of positions or ids (bare graph ids resolve to
`node:<id>`), following the graph's curved edges. `size` is the head radius and `trail` the
trail length (default 0.18). `Spray` emits particles from `position`, from the instance id in
`under`, or beneath lit graph leaves with `under="leaves:lit"`; it also takes `spread`,
`velocity`, `size` and `seed`.

### Rows

```tsx
<Rows id="rows" count={9} spacing={1.1} speed={0.3}
  changes={[{ row: 4, step: 1 }, { row: 6, step: 2 }]} color="#163047" flashColor="#22d3ee" />
```

`Rows` scrolls a list through a fixed pool of instances. Listed `changes` flash on their step,
then stay in `flashColor` while other rows dim. `width`, `height`, `depth`, `start`, `position`,
`flashDuration`, `scroll` and `recycle` configure the column. `items` and `labels` add text;
label templates substitute `{item}`, `{initial}`, `{index}` and `{slot}`. `card` gives rows the
`Card` shape. Use `rows:row:4` to follow or focus logical row 4 while it is visible.

### Stages

```tsx
<Stage id="b" position={[12, 0, 0]} glow={0.6}
  wave={{ bob: [0.1, 4], orbit: [0.07, 7], pulse: [0.2, 3], lag: 0.3 }}>
  <Box color="#22d3ee" emissive={4} />
</Stage>
```

A `Stage` groups primitives under one animated `position`, `glow` and `opacity`. Each `wave`
entry is `[amplitude, period in seconds]`: `bob` rises and falls, `orbit` circles in the ground
plane and `pulse` scales glow. With `step` and `delay`, the stage holds still until then.
Lights and the floor stay in world space inside a stage. Follow a stage as `stage:<id>`.

### Cards and labels

```tsx
<Card id="ada" position={[0, 1, 0]} scale={[4, 0.66, 0.18]} color="#22d3ee"
  emissive={0.2} title="Ada" subtitle="Lovelace" meta="key 1" />
<Label text="items.map(render)" mono size={0.25} />
```

A `Card` is a flat rounded glass panel. With the default `size`, `scale` is its full width,
height and depth. Style props are `radius` (default 0.12), `edge` (rim strength), `glow` (outer
glow width), `line` (border width in device pixels), `fill` (body opacity, default 1) and
`avatar` (radius as a share of half the height; 0 hides it). Low `emissive` gives dark glass;
higher values tint the card in `color`. A card with a `title` shows an avatar with the initial
(or `initials`), the title, an optional `subtitle` and a right-aligned mono `meta` tag. Cards
with text need an `id`. `opacity` fades the text and `titleOpacity` the title alone.

`Label` draws vector text: `text`, `position`, `size`, `color`, `emissive`, `opacity`, `align`,
`weight` (`"regular"`, `"medium"` default, or `"bold"`, Roboto) and `mono` (JetBrains Mono).
`attach` positions a label relative to another instance. Labels support printable ASCII up to
57 characters; other characters become `?`. Depth, fog and DOF apply to labels.

### 3D text

```tsx
<Text3D id="title" text={"EVERY LETTER\nMOVES ON ITS OWN"} position={[0, 1.2, 0]} size={1.25} depth={0.26}
  color="#f2f4f8" emissive={0.75} side="#2a2c31" metal={0.85} roughness={0.32}
  enter={{ at: 0.3, offset: [0, 0.4, 9], spread: [10, 4, 4], rotation: [-40, 70, 25], scale: 0.4, stagger: 0.045, order: "random" }} />
```

`Text3D` draws extruded, beveled type. Each glyph is its own instance (`<id>:<index>`). `size`
is the em in world units; `depth`, `bevel` and `bevelWidth` are in em, and `bevelSegments`
rounds the bevel. The face uses `color` and `emissive`; the sides use `side`, `metal` and
`roughness`, or a `material`. `flat` draws only the face in its exact color. `align`,
`lineHeight`, `tracking` and `uppercase` control layout; `position` is the cap-height center of
the first line.

`enter` flies glyphs in from `offset`, `rotation` (degrees) and `scale` on `step` or `at`, one
every `stagger` seconds in `forward`, `reverse`, `center` or `random` `order`; `spread` adds
seeded scatter. `glyphs`, an array or `(index, char, home) => motion`, sets per-glyph `offset`,
`rotation`, `scale`, `color`, `emissive` and `opacity` tracks and overrides `enter`.

The default font is Barlow Condensed ExtraBold Italic; `mono` selects JetBrains Mono Bold. To
use another font, bake it with `packages/slides-effects/scripts/journey-text3d.cjs` (it needs
`opentype.js` and `earcut`) and pass the generated module's export as `font`. Only bake fonts
whose license allows redistribution with the deck.

### Render trees

```tsx
<RenderTree data={tree("app", [["list", ["a", "b"]], "footer"])}
  flashes={[undefined, "all", { subtree: "list" }, ["b"]]}
  labels={{ app: "App" }} position={[0, 1.6, 0]} spacing={[2.3, 1.75]} card={[2, 0.56]}
  total={{ position: [7, 1.4, 0] }} />
```

`RenderTree` draws a flat tree of rounded nodes. Each `flashes` entry belongs to one step and
is `"all"`, a list of ids, `{ subtree: id }`, or a typed flash `{ nodes, type, color }`. Flashed
nodes pulse top-down, then settle; each node shows its render count, and `total` places the
running sum. `flashColors` maps flash types to colors. `routing` is `"orthogonal"` (default) or
`"direct"`; `draw` animates edge coverage, `pulses={false}` disables traveling signals and
`pulseDuration` sets the time per level. Instance ids are `<id>:<node>` (default id `tree`).

### Tubes, pillars and voxels

`RoutedTube` draws a tube along a `path` of points with animated `draw` coverage (0 to 1),
`thickness`, `color`, `emissive` and `material`; `join="miter"` joins closed paths cleanly.
`pulses` lists beads that travel the path: `{ step, at, delay, duration, every, color, size,
emissive, trailEmissive, beads }`.

`Pillar` is a bar with a counter on top: `id`, `value`, `from` (default 0), `maximum`, `height`,
`width`, `depth`, `position` (floor anchor), `color`, `label`, `counterSize`, `material`,
`emissive`, `capEmissive`, `radius`, `gradient` and `counter={false}`. `step` or `at`, `delay`,
`duration` (default 1.6 s) and `ease` (default `smoothstep`) drive the value.

```tsx
<Voxels id="cells" grid={[8, 8, 8]} spacing={0.5} size={0.18}
  color="#22d3ee" collapse={{ step: 1, to: 0.2, duration: 2.4 }} />
<JourneyCounter source="cells" position={[0.82, 0.2]} size={0.07} color="#ffffff" />
```

`Voxels` draws a grid of boxes; `collapse.to` is the share that survives. `JourneyCounter`
shows the live count from a `Voxels` source, drawn after the post effects so they don't obscure
it. Its `position` and `size` are in normalized canvas coordinates.

### Parts and assembly

```tsx
import { Choreography, primitive, type ChoreographyPart } from "slides:journey/Journey";

const part = (id: string, x: number): ChoreographyPart => ({ id, home: { position: [x, 0, 0] },
  instances: [primitive("box", { scale: [1, 0.6, 0.4] })] });
<Choreography id="assembly"
  layouts={[{ id: "pair", parts: [part("a", -2), part("b", 2)] }, { id: "base", parts: [part("c", 0)] }]}
  transitions={[{ from: "pair", to: "base", step: 1, duration: 1.4,
    stagger: 0.06, swapAt: 0.55, overshoot: 0.08, onLand: { count: 18, seed: 9 } }]} />
```

`Choreography` moves reusable parts between layouts. A part has an `id`, template `instances`
and a `home` pose (`position`, Euler `rotation` in radians, `scale`, `color`). Build templates
with `primitive`, `cardInstances` or `text3dInstances`; `partsFromInstances(instances)` turns an
instance array into parts at their original centers. Each transition uses a `step` or `at`.
Parts pair up cyclically by default; an explicit `mapping: [{ from, to, via, delay, swapAt }]`
must cover every part, and repeated sources split while repeated targets merge. `swapAt` is the
flight progress at which source geometry swaps for destination geometry. `onLand` fires a
seeded burst where each part lands. A standalone `<Burst position={[0, 0, 0]} step={1} />`
takes the same style: `count`, `lifetime`, `color`, `colors`, `emissive`, `size`, `speed`,
`spread`, `gravity` and `seed`.

### Reusable declarations

`defineSceneComponent(expand)` creates a component that expands into other Journey elements
while the scene is prepared. It must not use hooks or side effects. `<Instances items={...} />`
inserts instances built in code, including inside a `Stage`.

```tsx
const Sculpture = defineSceneComponent(({ color }: { color: string }) =>
  <Instances items={[primitive("sphere", { color, size: 2 })]} />);
```

## Materials, lighting and environment

```tsx
<Material id="paint" albedo="#243047" roughness={0.5} metal={0.15} />
<Box material="paint" position={[0, 1, 0]} />
<KeyLight position={[-6, 10, 8]} target={[0, 0, 0]} intensity={2} />
<Environment intensity={0.7} />
<Floor y={-1.5} size={40} />
```

`Material` declares a reusable material by `id`; a primitive's `material` prop also accepts an
inline object. Fields are `albedo` (lit surface color), `emissive`, `roughness`, `metal` and
`rim`, all animatable. Emission feeds bloom but does not light nearby surfaces; add a point
light for that.

- `KeyLight` is a directional light from `position` toward `target`, with `color` and
  `intensity` (default 2.2). `shadow` is `"map"` (default), `"contact"` for a cheaper
  screen-space shadow, or `false`. `shadowSize` is the half-width of the shadow box around
  `target` (default 20), `softness` the penumbra in texels, `shadowStrength` the share of light
  removed (default 0.85) and `shadowScale` the static map resolution (default 0.5). Cards,
  labels and SDFs do not cast shadows.
- `PointLight` and `SpotLight` take animated `position`, `color`, `intensity` and `range`; spot
  lights add `target` and `angle`, the outer cone half-angle in radians.
- `RimLight` adds a view-dependent rim `color` and `intensity`, visible even on dark materials.
- `Environment` adds soft studio reflections for glossy and metal surfaces. It is analytic, not
  an HDR image. Its `intensity` animates.

`Floor` draws a lit plane with animated `y` (default -5), `size`, `color`, `roughness`, `metal`
and `emissive`; fog fades it into the background. It also accepts `lit`, a `grid`
(`{ spacing, color, intensity, width }`) and a WGSL `shader` string that can change `color` and
`mask`, reading `world` (surface position) and `fade`.

## Post effects

```tsx
<DOF focus={{ 0: 16, 1: "subject" }} aperture={0.6} maxBlur={12} />
<Fog density={0.03} /><Shafts intensity={0.6} density={0.03} anisotropy={0.3} />
<Bloom intensity={1.2} /><Chromatic amount={0.002} />
```

| Element | Props |
| --- | --- |
| `Fog` | `density` (default 0), `color`, `height`, `falloff` |
| `DOF` | `focus` (distance or object id), `focusRange`, `aperture` (default 0.6), `maxBlur` (default 12), `scale`, `samples` |
| `Shafts` | Light shafts from point and spot lights: `intensity`, `density`, `anisotropy`, `scale`, `samples` |
| `Bloom` | `intensity` (default 0), `threshold` (default 1), `radius` (default 0.8), `mode`, `scale` (default 0.5) |
| `Chromatic` | `amount` |
| `Vignette` | `amount` (default 0.25) |
| `Grain` | `amount` (default 0.015) |

Strengths animate; `scale`, `samples` and `mode` are static and change the pipeline. Vignette
and grain apply even without their elements; set `amount={0}` to remove them. Bloom
`mode="soft"` (default) uses a soft threshold knee; `mode="unreal"` uses a luminance high-pass
like three.js UnrealBloomPass.

DOF focus comes from the `DOF` focus track, then the active shot's `focus`, then the camera
target. An object id focuses on that object, so a pulse, row or stage can be both a camera and
a focus target. `focusRange` is the half-width of the sharp band in world units (default 0).
Parts near the focus plane draw in a separate sharp layer; an animated boolean `sharp` prop on a
primitive, label or stage forces a part in or out of it.

The HDR stages run as fog, DOF, then bloom. Reorder them with
`<Journey postOrder={["dof", "fog", "bloom"]}>`; each name must appear exactly once. A final
stage then applies chromatic aberration, exposure, tone mapping, vignette, grain and output
encoding, followed by FXAA. A disabled stage still exists as an attachment point for custom passes.

## Custom passes

### WGSL hooks

```tsx
import { Pass } from "slides:journey/Journey";

const lines = `
fn customPass(uv:vec2f, color:vec4f, ctx:PassContext)->vec4f {
  let line=.96+.04*sin(uv.y*800.+ctx.slideTime*.3);
  return vec4f(color.rgb*line,color.a);
}`;
<Pass wgsl={lines} after="bloom" />
```

`Pass` runs a WGSL fragment named `customPass` on the post chain. It receives the previous
stage's color and a `PassContext` with `time`, `slideTime`, `stepTime`, `step` and `depth`.
`sampleHDR(uv)` reads the original scene and `sampleDepth(uv)` returns linear view depth. Place
a pass with one `before` or `after` of `scene`, `fog`, `dof`, `bloom` or `tonemap` (default
`after="bloom"`; `before="scene"` is invalid). Before tone mapping, colors are linear HDR; after
it, they are display sRGB. Extra textures in `reads` bind from group 0, binding 6 onward. WGSL
errors appear in the normal slide diagnostics.

### Custom effects

```tsx
import { d } from "typegpu";
import { defineJourneyEffect, Effect, type JourneyEffectGraph } from "slides:journey/Journey";

const depthTint = defineJourneyEffect({
  name: "depth-tint", params: { amount: d.f32, tint: d.vec3f }, defaults: { amount: 0, tint: "#3b82f6" },
  build: ({ input, id }): JourneyEffectGraph => ({ passes: [{
    id: id(), fragment: "main", reads: { source: input, depth: "depth" }, output: id(),
    wgsl: `@fragment fn main(@location(0) uv:vec2f)->@location(0) vec4f {
      let p=params(); let color=textureSampleLevel(source,linearSampler,uv,0.).rgb;
      return vec4f(mix(color,p.tint,p.amount*smoothstep(0.,40.,depthAt(uv))),1.);
    }` }] }),
});
<Effect use={depthTint({ amount: { 0: 0, 1: 0.8 } })} after="bloom" />
```

`defineJourneyEffect` declares a reusable multi-pass effect with typed, animatable params. Params
are a TypeGPU struct of `d.f32` or `d.vec3f` fields; the pack generates the matching WGSL struct
and a `params()` loader from the same schema. Names are kebab-case.

`build` receives `input` (the incoming color target), JSON `options`, `quality`, `scale`,
`samples`, `levels` and `id(name)`, which namespaces ids (`id("blur")` is `<effect>-blur`; a
repeated effect becomes `<effect>-2`). Each pass lists its texture bindings in `reads`:
`depth: "depth"` enables `depthAt(uv)`, and any other entry binds a `texture_2d<f32>`. Declare
reduced-scale or mipmapped targets in `targets`; the last pass becomes the stage's color.
Returning `add: { source, gain }` instead adds `source`, scaled by the WGSL expression `gain`,
onto the input.

Calling the effect takes param values (constants, step maps or keyframes, which never rebuild
the pipeline) and optional JSON options, which select topology. Placement works like `Pass`,
defaulting to the definition's `after`, then `bloom`. The built-in `haze` effect fades the scene
behind the focus plane toward `tint`, lighter toward `horizon` near the top, while sharp-layer
content stays crisp: `<Effect use={haze({ tint: "#161616" })} />`. It runs after DOF.

### Custom geometry and SDFs

```tsx
import { Custom, SDF } from "slides:journey/Journey";

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

const roundedBox = `
fn sdf(p:vec3f)->f32 {
  let q=abs(p)-vec3f(.8,1.3,.8);
  return length(max(q,vec3f(0.)))+min(max(q.x,max(q.y,q.z)),0.)-.15;
}`;
<SDF wgsl={roundedBox} bounds={[[-2,-2,-2],[2,2,2]]} color="#22d3ee" emissive={0.3} />
```

`Custom` draws instanced geometry from WGSL: you supply vertex positions, normals and a
material, and the pack handles projection, depth, lighting, fog and post. `ShapeContext` has
`time`, `slideTime`, `stepTime` and `step`; `ShapeVertex` has `position` and `normal`; the WGSL
`Material` has `albedo`, `emissive` (RGB), `roughness` and `metal`. `Custom` also takes the
primitive props.

`SDF` ray-marches a signed distance function inside a bounding box and writes the true hit
depth. Keep the shape inside `bounds`; `steps` (1 to 256) sets the march cost. For a fully
custom render graph, use `GPURenderGraph` from `@legend-apps/presentation` directly.

## Performance

`quality` picks a preset. Output resolution never changes; only offscreen targets do.

| Quality | Scene scale | Bloom levels | MSAA |
| --- | --- | --- | --- |
| `high` | 1 | 5 | 4x |
| `medium` | 0.85 | 5 | 4x |
| `low` | 0.65 | 3 | off |
| `auto` (default) | 1, adaptive | 5 | 4x, off on high-density displays |

`auto` lowers the scale in steps down to 0.75 when playback stays slow, and raises it again once
playback is healthy. Previews and thumbnails use the static scale. Use a fixed `quality` for
repeatable output. `renderScale` (greater than 0, at most 1) multiplies every offscreen target
on top of the preset; `0.75` renders about 56% of the pixels. `msaaSamples={1}` turns off MSAA
and `msaaSamples={4}` forces it; FXAA always runs. `DOF`, `Shafts`, `Bloom` and `KeyLight` take
their own static scale, and `DOF` and `Shafts` take `samples`.

- Keep related builds in one Journey, and build large scenes once in deck-local TSX rather than
  on every render.
- Prefer instanced elements (`Rows`, `Orbs`, `Text3D`, parts) to many separate objects. Fewer
  objects and shorter tracks mean less sampling per frame.
- Animate with tracks or WGSL, never with JS timers or React state updates.
- Add DOF, shadow maps, shafts and custom passes one at a time; each adds offscreen work.
  Lower their scale or samples, or SDF `steps`, before shrinking text.

## Examples

- [`examples/journey/example.mdx`](../../examples/journey/example.mdx): orbs, graph waves and subsets.
- [`apps/slides/examples/3d/data-flow.mdx`](../../../../apps/slides/examples/3d/data-flow.mdx): background Journeys with pulses, rows, stages, voxels and a counter.
- [`apps/slides/examples/data-visuals.mdx`](../../../../apps/slides/examples/data-visuals.mdx): a render tree beside charts.
- [`apps/slides/examples/offscreen.mdx`](../../../../apps/slides/examples/offscreen.mdx): a background Journey with a box and a label.

When copying an example, keep its local TSX, assets and effect lockfile.
