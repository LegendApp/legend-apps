# Components, effects, and runtime

Contents: native components · imports · templates · effects · GPU · Webview · lifecycle · local packs.

## Native MDX versus local TSX

Available directly in MDX: `View`, `Text`, `Image`, `Pressable`, `Step`, `Steps`,
`SharedElement`, `FocusRegion`, `Background`, `Effect`, `LiquidGlass`, `TypeGPU`,
`Webview`, and `Layout` (used by Markdown directives). `Deck` and `Slide` are
compiler plumbing; authors normally use frontmatter and separators.

The host's MDX View/Pressable adapters wrap literal text for native rendering.
In local TSX, import from `react-native` and put strings in `Text`. Use native
styles and Uniwind `className`; browser CSS properties and DOM events do not apply.
Local TSX cannot import Effect/LiquidGlass/TypeGPU from `@legend-apps/presentation`:
those are host MDX components, not package exports. Compose them in MDX or pass
children/component props into local components.

Supported host package imports (exact paths, not arbitrary subpaths):

- `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`, `react-native`
- `@legendapp/state`, `@legendapp/state/react`, `@legendapp/state/sync`
- `@legendapp/motion`, `@legend-apps/presentation`
- `@shopify/react-native-skia`, `lottie-react-native`, `react-native-webview`
- `react-native-webgpu`, `typegpu`, `typegpu/common`, `typegpu/data`, `typegpu/std`
- `@typegpu/noise`, `@typegpu/react`

Native deck imports can use local TS/TSX/JS/JSX/JSON and image files. macOS and
native file variants resolve before generic ones. Imports must stay beneath the
deck's directory, including symlinks. Network imports and other npm packages are
rejected. No deck-local package manifest installs new native capabilities.
Uniwind scans static classes in the deck directory; construct complete literal
class names, not `bg-${color}-500`.

Deck code runs in Hermes with the app's permissions. It is trusted code, not a
sandbox, and it does not have browser globals or Node APIs merely because the
compiler uses Bun. Avoid blocking JS, unbounded timers, and external side effects
on mount: previews/prepared slides may mount before presentation.

## Templates and backgrounds

`template: ./Frame.tsx` selects a default export receiving `{children, deck, slide}`.
Slide frontmatter can select another template or `template: false`. A minimal template:

```tsx
import { View, Text } from "react-native";
import type { PresentationTemplateProps } from "@legend-apps/presentation";
export default function Frame({ children, deck }: PresentationTemplateProps) {
  return <View style={{ flex: 1, padding: 80 }}>
    <Text>{deck.title}</Text>
    <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>
  </View>;
}
```

`Background`, `FocusRegion`, and `SharedElement` ARE exported from
`@legend-apps/presentation`. Focus/shared wrappers accept native View props and
an `id`. `Background` accepts children and numeric `priority` (default 0).
Use -1 in templates, 0 for slide overrides. An empty Background suppresses lower
priorities. Declare only one per priority per slide. `useBackgroundSize()` gives
full-window `{width,height}`; stage size is not background size.

The selected background lives outside slide transitions. Same-type/key content
can retain state across slides. Continuous backgrounds should own a local clock;
slide animations should use the shared slide clock.

## Effect (captured native content)

| Prop | Default / meaning |
| --- | --- |
| `preset` | `liquid`; also `ripple`, `glitch`, `pixelate` |
| `shader` | Custom SkSL source, overrides preset |
| `active` | true; false shows initial frame; activation starts/restarts playback |
| `strength`, `speed` | 12 logical pixels, 1 time multiplier |
| `padding` | 0 logical pixels around capture |
| `previewTime` | 1.25 seconds |
| `blur` | 0; number, numeric observable, or numeric selector |
| `uniforms` | Record of Skia uniforms or tracked selector returning that record |
| `style`, `children` | Native wrapper style and content |

```mdx
<Effect preset="ripple" strength={36} speed={0.8} padding={48}>

# Waves through native text

</Effect>
```

Custom shaders receive `image` (captured content), `resolution`, `time`, and
`strength`. `half4 main(float2 position)` returns the sampled color. Built-ins:
liquid displaces/shimmers, ripple makes radial waves, glitch shifts bands and
color channels, pixelate samples blocks (static unless parameters change).

This is a snapshot image effect, not a live interactive filter. Give content
intrinsic/explicit bounds. Capture/shader failure falls back to native content.
Do not expect child UI updates or independently animated children to continuously
refresh the captured image. Previews use deterministic frames. `active` replaces
old `startOnStep` examples.

## LiquidGlass (reversible focus treatment)

Props: `active=false`, `blur=24`, `refraction=8`, `duration=700` milliseconds,
`variant="frosted"` or `"liquid"`, `overlay`, `children`, `style`. Blur/refraction
are logical pixels. The captured children become frosted; the optional overlay
fades in outside the filter and stays sharp. Reversal begins at current progress.
This is not the operating system's native backdrop material. Use `Steps` to drive
`active`, as shown in the authoring reference.

## TypeGPU (retired)

Legacy `TypeGPU scene={...}` callbacks are no longer supported: arbitrary JavaScript
render callbacks cannot run on the UI runtime. They fail with migration guidance.
Use `TypeGPUShader` with WGSL instead; the host drives it on the shared UI-thread
playback clock. Older talk/effects gallery examples using `TypeGPU` require migration.

## Webview (explicit browser boundary)

Use one of these in MDX, with explicit dimensions:

```mdx
<Webview src="./demo.html" style={{ width: 1200, height: 600 }} />
<Webview html="<h1>Hello</h1>" style={{ width: 1200, height: 600 }} />
<Webview component="./web/Demo.tsx" props={{ label: "Interactive demo" }}
  style={{ width: 1200, height: 600 }} />
```

`component` is a compiler-only, literal local path. Its default export is mounted
with React DOM and JSON-serializable `props`, in a separate JS runtime. The host
bundles React/React DOM, local code and CSS. Browser-component imports allow
`react` and JSX runtimes, `react-dom`, `react-dom/client`, `@legendapp/state`,
`@legendapp/state/react`, `@legendapp/state/sync`. No React Native or arbitrary npm.
Local components/pages cannot escape the deck directory. The compiler sets the
deck file URL as `baseUrl`/`readAccessUrl`. Remote `src` can load a page but requires
network availability; don't make an offline talk depend on it accidentally.
Native shared/step wrappers operate on the Webview rectangle, not its DOM nodes.
Native and browser observables are not shared across this boundary.

## Runtime and animation lifecycle

Import `usePresentationValue`, `usePresentation$`, `usePresentation`,
`useSlideLifecycle`, or `useStep` from `@legend-apps/presentation`.

| Field / command | Meaning |
| --- | --- |
| `currentSlide`, `currentStep` | Live navigation, zero-based; preview runtime uses its requested target |
| `slideIndex`, `stepIndex` | This rendered surface's slide and resolved step |
| `slideCount`, `stepCount` | Total slides / states |
| `isActive`, `isPreview`, `isPreparing` | Playback eligibility, static preview, prepared offscreen surface |
| `startedAt`, `stepStartedAt`, `stepEpochs` | Shared `performance.now()` epochs in milliseconds |
| `direction` | forward/backward |
| `goTo(index)`, `next()`, `previous()` | Navigation commands |

`usePresentationValue("stepIndex")` subscribes to one field. `usePresentation()`
subscribes to the whole runtime; reserve it for consumers needing that breadth.
`useStep(N)` returns `{reached,isCurrent,elapsed,startedAt,direction}`; elapsed is
seconds since reaching N, continues over later steps, and resets after reversing
before N. `useSlideLifecycle()` selects lifecycle fields.

Native audience playback keeps the current slide and up to two neighbors on each
side mounted, plus an outgoing transition surface. Mount is not activation.
Use `isActive && !isPreview` to run clocks; cleanup timers/listeners on inactivity
and unmount. Shared epochs keep presenter and audience aligned. Preview frames
must be deterministic and must not run an ongoing animation loop.

Both `PresentationProvider` and `PresentationObservableProvider` take an existing
`Observable<PresentationRuntime>` as `value`, not a plain snapshot. Deck authors
normally consume the host context instead of providing it. Keep canonical data
in one observable, use `useValue` in small leaves, and `peek()` in imperative
callbacks. Do not mirror changing React props with `useObservable(..., deps)`.
The host's version-specific `useRuntimeProjection` adapter is internal integration
support, not needed for ordinary deck components.

## Local effect packs (not installed host components)

The source checkout contains `../legend-talks/react-native-desktop/effects.mdx`,
a 39-slide gallery. Its `packs/` directory and `PresentingDemos.tsx` are reusable
source, not built-in names. To use them outside that directory, copy the necessary
modules/assets beneath the new deck and update relative imports. `slides:` package
names in prototype notes are proposals, not a working import resolver.

| Family | Available examples |
| --- | --- |
| Background / distortion / glass | AmbientAurora, prismaticTear, liquidGlass, MaterialSampler |
| Reveal / transform | NativeLayerPeel, ComponentXRay, FocusSpotlight, CodeToUI, CodeToPixels, PlatformMetamorphosis |
| Data / GPU | NativeDataWindow, gpuConstellation, gpuInterfaceReveal |
| Motion / depth / interaction | PhysicsLayout, InfiniteDesktop, MagneticCursor |
| Performance / charts | BenchmarkArrival, LatencyRace, MemoryGravity, FrameBudget, ThreadPressure |
| Other | AgentDeviceScan, NativeOrbitLottie, WindowPortal, ChromeConveyor, ShaderTypography |

Newer packs offer `intensity="light"|"heavy"`, `tempo="slow"|"fast"`, optional
`durationSeconds` and `previewProgress`; check each component's exported props.
Performance visuals distinguish measurements from illustrative values. Preserve
that distinction when reusing them. Lottie requires the host's native runtime;
Rive is not supplied merely by placing a `.riv` asset in the deck.

The `packs/presenting` folder has navigation-driven explanation tools:

- `AttentionStage` / `AttentionTarget id` / `Spotlight target`: measured attention
  regions. `Callout target side` supports above/below/left/right, width, children.
  Put overlays after content. Missing targets render no callout.
- `FreezeFrame paused annotation`: render callback receives controlled seconds.
  It does not pause autonomous timers/video inside arbitrary children.
- `ProgressiveDetail expanded summary detail`: opens a detail pane beside summary.
- `ComparisonWipe position before after`: position 0–1; aligned clipped content,
  with before/after labels. Prop-controlled, not a draggable divider.
- `CodeWalkthrough source lines={[start,end]} explanation`: inclusive one-based
  lines; emphasis and scrolling, not token syntax highlighting; default height 580.
- `ExplodedLayers expanded layers`: conceptual layers with id/label/content/color.
- `ContentSwap active before after duration`: crossfade in explicit bounds.

These tools keep content mounted; hidden children need their own playback control.
Read the actual pack README and component props before composing advanced demos.

### GPU programs inside local TSX and packs

Import `GPUShader` from `@legend-apps/presentation` for local effects. Slides
provides its renderer automatically. It accepts the same `code`, dimensions,
`particles`, `particleCount`, and `previewTime` as `TypeGPUShader`, plus
`clock="slide" | "step"`, `image` (a deck asset URI), `particleBlend="over"`
(default: additive), `borderRadius`, and a React `fallback` for unsupported hosts.
A `frameData` shared value and `frameDataSize` in floats can supply existing UI
worklet simulation data at binding 5. Keep visual clocks in that same snapshot
when a simulation publishes them atomically with positions.

The 32-byte frame uniform includes slide and step time in its last two floats.
Image programs declare sampler/texture bindings 3/4 in group 0. Optional
`composite` programs render their field to an HDR texture, then use
`compositeFragment` with sampler/texture bindings 0/1 in group 1. This supports
lens refraction without a custom rendering loop. `materials/GPU` exposes small
WGSL frame, image, and quad helpers. Keep native per-frame updates in host-compiled
worklets, and use Skia fallbacks where WebGPU is unavailable.
