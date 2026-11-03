# Slide components in one World

Each MDX slide renders its own React component. That component declares a
`WorldSlide` with the same `world` name. The existing background host retains
one `World` surface outside slide transitions; navigation replaces its scene
declaration, rather than mounting a new GPU surface. No central slide switch is
needed. Native text overlays and the existing World lighting remain available.
The host freezes and retains the surface through a cold slide's registration
commit; an incoming slide without a background clears it after that handoff.

```tsx
export function Panels() {
  return <WorldSlide world="showcase" track={{ spacing: 32, duration: 1.7 }}>
    <Card id="sample-a" title="const a = 24" position={[-4, 0, 0]}
      scale={[3.5, 1.3, 0.15]} avatar={0} />
  </WorldSlide>;
}
export function Columns() {
  return <WorldSlide world="showcase" track={{ spacing: 32, duration: 1.7 }}>
    <Card id="sample-a" title="const a = 24" titleOpacity={0}
      position={[-4, 0, 0]} scale={[0.8, 3, 0.8]} avatar={0} />
  </WorldSlide>;
}
```

`WorldSlide` accepts World appearance props, supplies `background`, and requires
a world name. World parts remain declarative elements/fragments; ordinary React
components compose the slide around `WorldSlide`, rather than being invoked by
the scene collector. A small local wrapper can share appearance declarations.

## Camera contract

The camera holds exactly still at each station. Navigation travels along a stored
rail; Previous traverses that rail in reverse, restoring the earlier station.
An interrupted move begins from the last sampled rail coordinate, without a snap.
A direct jump crosses the intervening segments; unvisited segments use the default
curve. Jumps scale travel time by the number of crossed stations. Steps can morph objects
without allocating another camera station or resetting an ongoing flight.

`track` is a small per-slide declaration. Use one `spacing` throughout a World
(default 32). `duration` defaults to 1.7 seconds. Camera `position` and `target`
are local to that slide's station. `via` and `viaTarget` are quadratic control
points for the incoming segment, also local to its destination station. They
shape the curve without requiring a central camera timeline:

```tsx
<WorldSlide world="showcase" track={{
  spacing: 32, duration: 1.7,
  position: [-2.2, 3.6, 14], target: [0, 0, 0],
  via: [2.5, 5.5, 22], viaTarget: [0, 0, 10],
}}>
  <Card id="sample-a" position={[-4, 0, 0]} />
</WorldSlide>
```

The default curve rises and bends sideways, then settles at `[0, 3.6, 14]`,
looking at the station origin. Field of view is 40 degrees; roll is zero.
Floor markings remain in world coordinates. All per-frame motion runs on the
shared presentation UI clock. Paused/outgoing surfaces freeze; preparation and
previews are static and never alter live continuity. Changing the world name
or leaving its background resets the retained journey.

## Object contract

An explicit `id` matches a part between scenes. Reusing it morphs position,
scale, color, emission and opacity from the last rendered values, including
interrupted moves. Keep the same geometry family; arbitrary mesh topology and
text replacement remain outside this API. New ids fade in. Duplicate ids within
a scene are errors. Anonymous parts have no cross-slide identity.

Omitted ids retain their last sampled world pose. The camera flies past them;
they become invisible only when their bounds have passed behind its view plane.
Their draw descriptors and frozen pose remain available so reversing restores
them in place. Redeclaring an id resumes its normal morph. Retention belongs to
the World surface, independently for each audience and preview host, and ends
when that surface is reset. It is bounded by the ids visited in that World.

## One shared scene

Replacing the declaration on each slide suits small scenes. With thousands of parts it rebuilds pipelines and re-sends the scene on every key press. `track.frame: "world"` instead lets slides pass one identical `children` array: tracks hold a pose per running beat (`stepOffset`), and `track.carry` flies each changed id between poses on a bowed path, with Previous as its exact mirror. Uniforms stay cached; only parts in flight are written, into a separate output. See the World README.

## Motion matched from reference

The source's main station-to-station moves last **1.7 seconds**, with **32 units**
between content stations. They use cubic ease-in/out:
`4t³` below 0.5, otherwise `1 - (-2t + 2)³ / 2`. Position and look target follow
separate quadratic curves. Main flights use **40° vertical FOV**, **0 radians
roll**, and no banking. Their forward displacement is approximately **29.5–30.6
units**, averaging **17.4–18.0 units/second** before accounting for the side and
vertical arc. The eased parameter reaches 0.0625, 0.5 and 0.9375 at 25%, 50% and
75% of the duration; its peak rate is 3 / 1.7 = **1.765 per second**.

The generic defaults use the same duration, easing, FOV and zero roll, a 32-unit
station spacing, and quadratic controls `[2.5, 5.5, 22]` for the camera and
`[0, 0, 10]` for its look target. At 0.85 seconds the default camera is
`[1.25, 4.55, -6]`, looking at `[0, 0, -19]`. The showcase's second authored
curve switches the lateral bend using `[-3.5, 6.5, 20]`. Height and aim are
adapted to its generic panels and columns. The opening uses a 2.0-second
cubic-out settle, widening FOV from 38° to 40°.
The following between-beat drift uses sine easing over 2.2 or 3.7 seconds, with
at most 0.0245 units of per-axis camera jitter. Those ambient motions are omitted
to meet the stationary-hold decision. Reverse navigation samples these same stored curves in decreasing order.

## Three slides: before

```mdx
import { World, Card } from "slides:world/World"

<Background><World background><Card title="const a = 24" id="a" /></World></Background>

---

<Background><World background><Card title="const a = 24" id="a" scale={[2, 1, 1]} /></World></Background>

---

<Background><World background><Card title="const a = 24" id="a" scale={[1, 3, 1]} /></World></Background>
```

## Three slides: after

```mdx
import { Panels, OnTrack, Columns } from "./world-continuity"

<Panels />

---

<OnTrack />

---

<Columns />
```

The generic example lives in `apps/slides/examples/3d/world-continuity.mdx`.
Its three local components declare the same three Card ids, with their own
per-slide poses. The dark background, cyan/amber accents, floor and bloom use
the existing World renderer and appearance controls. A fourth Card is declared
only on the first slide to demonstrate omitted-object retention.
