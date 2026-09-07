# React Native is the best way to build desktop apps

A complete first draft for Legend Slides: **31 main slides + 23 effect-gallery
slides + 11 backups**, with speaker notes on every slide. The main running order
budgets **18 minutes**, plus two minutes for laughter and transitions. The
audience is React Native developers who mostly do not know about desktop support.

Open `talk.mdx` in Legend Slides. From this worktree:

```sh
bun run slides run macos -- apps/slides/decks/react-native-desktop/talk.mdx
```

[Running order](./RUNNING_ORDER.md) lists slide numbers and timing.
[Sources](./sources.md) maps claims and code excerpts to their evidence.
[Benchmark source](./benchmark-source.md) records the comparison methodology.

## Editing the draft

The talk moves from the compromise assumption to desktop discovery, Chat History,
the nine implementations, performance and memory, native ownership, native UI,
the glass joke, Skia and TypeGPU, development, native modules, agent verification,
desktop craft and the final recommendation.

All audience-facing slides have content. Native UI and agent sections use complete
diagrams, actual source excerpts and concrete workflow examples. Live demos can
replace those explanations later; the deck does not depend on unrecorded demos.
The Chat History artwork is synthetic. It is not a screenshot of the real app.

- `talk.mdx`: slide copy, ordering, transitions and speaker notes.
- `Scene.tsx` and `Content.tsx`: native layout, charts, diagrams and artwork.
- `snippets.ts`: short source excerpts and labeled usage examples.
- `benchmark.ts`: measured values, chart labels and sorting.
- `packs/`: reusable backgrounds, shaders, reveals, transformations, charts and transitions.
- `GlassCaption.tsx`: automatic glass escalation copy.
- `sidebarStorm.ts`: the TypeGPU scene.

No dependencies, host changes or native module changes are needed by this deck.
Do not copy the entire talk into another generated deck: edit the MDX directly.

## Effects

Slide 15 is **one continuously animated glass joke**. It begins as two localized,
restrained glass surfaces, holds for four seconds, changes caption at 12 seconds
and reaches maximum absurdity at 28 seconds. The controls remain crisp above the
material while refraction, caustics and color separation escalate inside it. It
keeps moving until you advance; revisiting restarts the sequence.
The presenter’s Current view and audience animate from the same clock; Next
shows a stable final frame. Only the caption leaf updates at its two beats;
the host’s shader clock drives the distortion.

The native reset on slide 16 shows actual Swift source. It does not pretend that
a custom shader is Apple's material. Slides does not currently expose the native
GlassEffectView package to decks. A genuine live material demo would need native
linking or a switch to an app that already uses it.

The `packs` folder prototypes the future `slides:` virtual namespace described in
`packs/README.md`. These deck-local versions bundle with the MDX and require no
installation. Every slide uses the slowly drifting ambient aurora. The opening
assumption uses a configurable brief fault with explicit delay, duration and
interval controls.

Slides 32–54 form an optional effect gallery. They demonstrate a native-layer
peel, code-to-interface transformation, native-data boundary, benchmark arrival,
agent-device scan, desktop-window portal, platform-chrome conveyor and TypeGPU
data constellation. Three performance effects add a latency race, memory gravity
and a frame-budget scanner. A generated Lottie JSON example uses native vector
playback. Eleven configurable additions cover platform metamorphosis, thread
pressure, shader typography, pointer magnetism, component X-ray, material
sampling, GPU interface assembly, code-to-pixels, physics layout, focus spotlight
and recursive desktops. The JS-driven pack effects use the shared slide lifecycle,
so presenter previews are static and returning to an active slide restarts its
animation. The TypeGPU constellation draws 1,024 moving fragments in one
instanced draw. No effect-performance measurements are claimed.

## Validation and rehearsal

The deck files pass a focused TypeScript check and the MDX compiles with no
warnings. All 65 slides have speaker notes. Validation covers SkSL compilation,
TypeGPU shader generation, a headless WebGPU render pass, glass caption timing,
cleanup, restart and static preview behavior.

The offline previews approximate native layout. Rehearse native playback, font
metrics and timing on the actual presentation display before presenting.

Native macOS verification after the effects fixes: a debug rebuild, 21 slide
visits covering glass (15), ripple (17), TypeGPU (18), glitch (2), closing ripple
(31), and their neighboring slides. Both windows were captured on every visit;
the effects remained visible on repeated forward and backward navigation.
Each glass visit ran for 31 seconds, and ripple returns included presenter
resizing. Current and audience showed the same glass escalation stage.
The workspace typecheck, Slides/macOS verification, and capture/clock regression
tests pass. The Skia native patch requires rebuilding the app; Metro reload alone
cannot apply it.

The first eight gallery slides were also played in the native macOS app from a temporary
copy outside Documents. Every opening and completed state rendered, and reverse
navigation restarted the automation, portal, chrome and TypeGPU effects without
blanking. The TypeGPU constellation continued moving after a leave-and-return cycle.
The latency, memory-gravity and frame-budget slides were then checked in the same
native app. Their opening, completed and repeated states remained visible during
forward and backward navigation.
