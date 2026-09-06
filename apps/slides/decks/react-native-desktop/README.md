# React Native is the best way to build desktop apps

A complete first draft for Legend Slides: **31 main slides + 11 backups**, with
speaker notes on every slide. The main running order budgets **18 minutes**, plus
two minutes for laughter and transitions. The audience is React Native developers
who mostly do not know about desktop support.

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
- `glassShader.ts` and `GlassCaption.tsx`: automatic glass escalation.
- `sidebarStorm.ts`: the TypeGPU scene.

No dependencies, host changes or native module changes are needed by this deck.
Do not copy the entire talk into another generated deck: edit the MDX directly.

## Effects

Slide 15 is **one continuously animated glass joke**. It starts subtle, holds for
four seconds, changes caption at 12 seconds and reaches maximum distortion at
28 seconds. It keeps moving until you advance; revisiting restarts the sequence.
Presenter previews show a stable final frame. Only the caption leaf updates at
its two beats; the host's shader clock drives the distortion.

The native reset on slide 16 shows actual Swift source. It does not pretend that
a custom shader is Apple's material. Slides does not currently expose the native
GlassEffectView package to decks. A genuine live material demo would need native
linking or a switch to an app that already uses it.

Other effects include the opening-assumption glitch, Skia ripple, the TypeGPU
scene with 384 sidebars and a restrained closing ripple. Evidence charts remain
still so their values are readable. No effect-performance measurements are claimed.

## Validation and rehearsal

The deck files pass a focused TypeScript check and the MDX compiles with no warnings. All 42 slides have notes and rendered offline
for visual review; bounds checks found no off-stage text. SkSL compilation,
TypeGPU shader generation and a headless WebGPU render pass. Glass caption timing,
cleanup, restart and static preview checks pass.

The offline previews approximate native layout and are not screenshots from
Legend Slides. Native playback, font metrics and timing still need rehearsal on
the presentation display. Earlier Bun startup hangs prevented a native rehearsal;
this pass uses the installed Node runtime for authoring checks.

The full workspace TypeScript check currently fails in separately edited
`apps/slides/src/DeckRenderer.tsx`: `MissingSlideTemplate` has an inferred `void`
return type and is used as JSX. This authoring pass leaves that host work untouched.
