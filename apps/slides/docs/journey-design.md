# Slide components in one Journey

Each MDX slide renders its own React component. That component declares a
`JourneyStop` with the same `journey` name. The existing background host retains
one `Journey` surface outside slide transitions; navigation replaces its scene
declaration, rather than mounting a new GPU surface. No central slide switch is
needed. Native text overlays and the existing Journey lighting remain available.
The host freezes and retains the surface through a cold slide's registration
commit; an incoming slide without a background clears it after that handoff.

```tsx
export function Panels() {
  return <JourneyStop journey="showcase" track={{ spacing: 32, duration: 1.7 }}>
    <Card id="sample-a" title="const a = 24" position={[-4, 0, 0]}
      scale={[3.5, 1.3, 0.15]} avatar={0} />
  </JourneyStop>;
}
export function Columns() {
  return <JourneyStop journey="showcase" track={{ spacing: 32, duration: 1.7 }}>
    <Card id="sample-a" title="const a = 24" titleOpacity={0}
      position={[-4, 0, 0]} scale={[0.8, 3, 0.8]} avatar={0} />
  </JourneyStop>;
}
```

`JourneyStop` accepts Journey appearance props, supplies `background`, and requires
a journey name. Journey parts remain declarative elements/fragments; ordinary React
components compose the slide around `JourneyStop`, rather than being invoked by
the scene collector. A small local wrapper can share appearance declarations.

## Camera contract

The camera holds exactly still at each station. Navigation travels along a stored
rail; Previous traverses that rail in reverse, restoring the earlier station.
An interrupted move begins from the last sampled rail coordinate, without a snap.
A direct jump crosses the intervening segments; unvisited segments use the default
curve. Jumps scale travel time by the number of crossed stations. Steps can morph objects
without allocating another camera station or resetting an ongoing flight.

`track` is a small per-slide declaration. Use one `spacing` throughout a Journey
(default 48, or 32 with `frame: "world"`). `duration` defaults to 1.7 seconds. Stations advance
along `advance` (default `[0, 0, -1]`, forward; `[1, 0, 0]` pans sideways). Camera `position` and `target`
are local to that slide's station. `via` and `viaTarget` are quadratic control
points for the incoming segment, also local to its destination station. They
shape the curve without requiring a central camera timeline:

```tsx
<JourneyStop journey="showcase" track={{
  spacing: 32, duration: 1.7,
  position: [-2.2, 3.6, 14], target: [0, 0, 0],
  via: [2.5, 5.5, 22], viaTarget: [0, 0, 10],
}}>
  <Card id="sample-a" position={[-4, 0, 0]} />
</JourneyStop>
```

The default curve rises and bends sideways, then settles at `[0, 3.6, 14]`,
looking at the station origin. Field of view is 40 degrees; roll is zero.
Floor markings remain in world coordinates. All per-frame motion runs on the
shared presentation UI clock. Paused/outgoing surfaces freeze; preparation and
previews are static and never alter live continuity. Changing the journey name
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
the Journey surface, independently for each audience and preview host, and ends
when that surface is reset. It is bounded by the ids visited in that Journey.

## One shared scene

Replacing the declaration on each slide suits small scenes. With thousands of parts it rebuilds pipelines and re-sends the scene on every key press. `track.frame: "world"` instead lets slides pass one identical `children` array: tracks hold a pose per running beat (`stepOffset`, or `"auto"` to count earlier stops' steps from the deck), and `track.carry` flies each changed id between poses on a bowed path, with Previous as its exact mirror. Uniforms stay cached; only parts in flight are written, into a separate output. See the [Journey pack README](../../../packages/slides-effects/packs/journey/README.md).

## Default motion

Station-to-station moves last 1.7 seconds with 48 units between stations by default. They
use cubic ease-in/out (`4t³` below 0.5, otherwise `1 - (-2t + 2)³ / 2`). Position
and look target follow separate quadratic curves, with default controls
`[2.5, 5.5, 22]` for the camera and `[0, 0, 10]` for its target. Field of view is
40 degrees, with zero roll and no banking. Reverse navigation samples the same
stored curves in decreasing order.

## Three slides: before

```mdx
import { Journey, Card } from "slides:journey/Journey"

<Background><Journey background><Card title="const a = 24" id="a" /></Journey></Background>

---

<Background><Journey background><Card title="const a = 24" id="a" scale={[2, 1, 1]} /></Journey></Background>

---

<Background><Journey background><Card title="const a = 24" id="a" scale={[1, 3, 1]} /></Journey></Background>
```

## Three slides: after

```mdx
import { Panels, OnTrack, Columns } from "./journey-continuity"

<Panels />

---

<OnTrack />

---

<Columns />
```

Each local component declares the same three Card ids with its own per-slide
pose. The dark background, accents, floor and bloom use the existing Journey
renderer and appearance controls. A component can also declare a Card only on
the first slide; it stays in place, as described under the object contract.
