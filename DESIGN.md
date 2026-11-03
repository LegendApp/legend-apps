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
  return <WorldSlide world="showcase" track={{ spacing: 18, duration: 1.5 }}>
    <Card id="sample-a" title="const a = 24" position={[-4, 0, 0]}
      scale={[3.5, 1.3, 0.15]} avatar={0} />
  </WorldSlide>;
}
export function Columns() {
  return <WorldSlide world="showcase" track={{ spacing: 18, duration: 1.5 }}>
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

The prototype uses a straight track along negative Z, with fixed camera height,
heading and field of view. `spacing` is the distance to the next station;
`duration` is the travel time in seconds. A small positive `cruise` speed keeps
the camera advancing during live playback. There is no vertical bob or orbit.
Scene coordinates are local to the destination station. Floor markings remain
in world coordinates, making travel visible. The track replaces authored camera
shots while enabled.

Every slide or step navigation allocates the next station from the last rendered
camera distance. **Previous also travels forward:** earlier content is staged
ahead of the camera and shared objects return to their earlier shapes. Direct
jumps travel one segment, rather than crossing every skipped slide. Interrupted
travel starts at the last sampled pose, without snapping or reversing.

Only the shared presentation UI clock advances motion. Paused/outgoing surfaces
freeze; preparing starts at zero; previews use deterministic local coordinates
and never alter live continuity. Each audience/preview host owns its own state.
Changing the world name resets the journey. Leaving the World background ends
the retained surface. Cruise can eventually pass a station during a long pause;
whether to stop at stations is a product decision, listed below.

## Object contract

An explicit `id` identifies a rendered part between adjacent scenes. Reusing it
morphs position, size, scale, color, emission and opacity from the last rendered
values, even when interrupted. A Card can flatten into a panel, then stretch
into a column while its title fades. Keep the same geometry family for a morph;
arbitrary mesh topology and text replacement are outside this prototype. New ids
fade in; omitted ids leave the scene. Persistence is explicit redeclaration, not
an accumulating global object registry. Duplicate ids within a scene are errors.

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
the existing World renderer and appearance controls.

## Questions for Jay

- Keep forward travel for Previous, or make Previous restore a stationary view?
- Keep slow cruise while speaking, or hold the camera at each station?
- Should omitted ids retire immediately, fade out, or persist until removed?
- Are straight tracks enough initially, or should authors declare curved rails?
