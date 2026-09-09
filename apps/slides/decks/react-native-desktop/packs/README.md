# Effect packs

These folders are local pack prototypes. They keep reusable visuals separate from
the talk's content while the plugin resolver is designed.

The proposed installed-pack namespace is `slides:`:

- `slides:backgrounds/ambient-aurora`
- `slides:reveal/native-layers`
- `slides:transform/code-to-ui`
- `slides:data/native-window`
- `slides:charts/arrival`
- `slides:automation/device-scan`
- `slides:transitions/window-portal`
- `slides:comparison/chrome-conveyor`
- `slides:data/gpu-constellation`
- `slides:performance/latency-race`
- `slides:performance/memory-gravity`
- `slides:performance/frame-budget`
- `slides:animation/lottie`
- `slides:transform/platform-metamorphosis`
- `slides:performance/thread-pressure`
- `slides:typography/shader`
- `slides:interaction/magnetic-cursor`
- `slides:reveal/component-xray`
- `slides:glass/material-sampler`
- `slides:data/gpu-interface-reveal`
- `slides:transform/code-to-pixels`
- `slides:motion/physics-layout`
- `slides:reveal/focus-spotlight`
- `slides:depth/infinite-desktop`
- `slides:distortion/prismatic-tear`
- `slides:glass/liquid`
- `slides:jay/absurd-glass` for a third-party pack

`slides:` is a virtual import prefix, not an npm scope. A future plugin resolver
can map it to trusted installed pack roots and bundle the selected modules into a
deck. These local prototypes use relative imports today, so they need no install
step or native rebuild.

Distortion shaders accept timing uniforms from `distortionTiming()`:

```ts
distortionTiming({
  delaySeconds: 3,
  durationSeconds: 0.34,
  intervalSeconds: 4.25,
});
```

This keeps effect strength separate from when and how often the effect runs.

The newer component packs share a small presentation profile:

```tsx
<PlatformMetamorphosis
  intensity="heavy"
  tempo="fast"
  durationSeconds={2.7}
  previewProgress={0.78}
/>
```

`intensity` changes displacement and visual density, while `tempo` selects a
default duration. `durationSeconds` overrides that duration and `previewProgress`
chooses the stable frame used in presenter previews. All time-driven components
restart from their opening frame when their slide becomes active again.

The performance effects expose their visual timing and comparison values as
props. `LatencyRace` and `MemoryGravity` default to the measured Chat History
results. `FrameBudget` defaults to illustrative values and labels them as such.

## Lottie and Rive assets

Deck-local packs cannot add a native animation runtime to an already built Slides
app. Slides now includes Lottie on macOS, so a local pack can import
`lottie-react-native` and bundle a JSON animation. A future plugin can declare a
required host capability such as `lottie` or `rive`; Slides can then enable that
pack only when its native binary contains the matching runtime. Adding another
runtime still requires refreshing native dependencies and rebuilding the app.

Lottie is the easier generated-asset path. `LottiePlayer` synchronizes JSON playback
with the slide lifecycle and keeps presenter previews static. Simple shape,
transform and trim-path animations can be authored as JSON, validated and bundled
with a deck. Complex animations should still come from an animation tool because the JSON format is a
compiled interchange format rather than a pleasant authoring API.

Rive is better for interactive state machines, but runtime files are binary `.riv`
exports from the Rive editor. An automated workflow can generate the storyboard,
vector assets, state-machine design and integration code; the editor or another
official exporter still needs to produce the `.riv` file.

## Presenting tools

The [presenting pack](presenting/README.md) adds measured spotlights and callouts,
a pausable animation clock with annotations, progressive detail, comparison wipes,
code walkthroughs, exploded layers and content replacement. Each has a dedicated
step-driven demo at the end of `talk.mdx`. These tools take ordinary props such as
`expanded`, `paused`, `position` and `active`; `Steps` controls the presentation.
