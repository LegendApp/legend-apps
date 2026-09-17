# Legend Slides

Legend Slides presents trusted local `.mdx` decks in a React Native macOS app. The presenter window shows the current slide, optional next-slide preview, speaker notes, build output, and the available displays. The audience window can run as a normal rehearsal window or borderless on a selected display.

## Run the sample

From the repository root:

```sh
bun run slides run macos -- apps/slides/examples/showcase.mdx
```

Bun compiles the deck when it opens and whenever a file in the deck directory changes. A failed rebuild leaves the last successful deck on screen and reports the error in the presenter window.

Opening the audience window locks the deck. Saves continue to compile, but new
code and styles are held until **Apply Update Now** is pressed. The lock stays
enabled after applying an update or stopping the audience window. Use **Unlock
Live Updates** to resume automatic updates; an already queued build still needs
to be applied explicitly. Opening another deck while locked queues it too.

If the presentation display disconnects, the audience output is blacked out and
closed. Reconnect it, select the display, and press **Present** to resume at the
same slide. It never automatically moves the talk onto your laptop screen.
Resolution and display-position changes resize the active audience window;
windowed rehearsal is left alone.

Slide render failures are isolated from the presenter controls. Details appear
under **Slide errors**; the audience sees a neutral fallback. **Retry Slide
Content**, navigating away and back, or applying a corrected build retries the
content. TypeGPU setup/render/device-loss errors and cleanup failures are caught
by the host. Arbitrary timers, event handlers, infinite loops, and native crashes
in trusted deck code are not sandboxed by React error boundaries.

`examples/showcase.mdx` exercises inline and fenced code, executable expressions, local TypeScript components, React state, speaker notes, per-slide transitions, and a lifecycle-aware React Native animation. `examples/demo.mdx` is a smaller starting point.

## Editing

With the audience closed, choose **Edit Source**. Editing replaces the presenter
workspace with the shared native source editor on the left and a slide preview
on the right. The MDX grammar highlights Markdown, YAML frontmatter and embedded
code. Moving the caret selects the corresponding slide; edits compile after a
350 ms pause, retaining the last successful preview on compilation errors.

Use **Save** or **⌘S** to write the draft. Saving refuses to overwrite changes
made externally. **Done Editing** offers save, discard or cancel for dirty drafts.
Save before closing the window or quitting: drafts are currently memory-only.
Presentation controls and navigation shortcuts are inactive in editing mode.

## Deck format

Document frontmatter configures the deck. Slides are separated by a top-level `---`; frontmatter immediately following a separator configures that slide.

```mdx
---
title: Product update
aspectRatio: 16:9
width: 1920
height: 1080
transition: fade
theme:
  backgroundColor: "#111827"
  color: "#f8fafc"
  fontFamily: Inter
presenter:
  showNext: true
  showNotes: true
template: templates/Frame
---

# First slide

<!-- Speaker notes can appear anywhere in a slide. -->

---
transition: slide
---

## Second slide
```

Transitions are `none`, `fade`, `slide`, or a `focus` configuration. The deck default is `none`, and slide frontmatter may override it.

## Shared elements

Append `{shared=title}` to a Markdown heading or paragraph, using the same ID
on another slide. No component or transition setting is required:

```mdx
# Our product {shared=title}

This content fades out.

---

## Our product {shared=title}

This new content fades in.
```

The attribute marks the whole heading or paragraph, including formatted text.
Quoted IDs also work: `{shared="product-title"}`. IDs may contain letters,
numbers, underscores, dots, and hyphens. Put the attribute at the end of the
block; inline spans and list-item attributes are not supported. Code examples
and escaped attributes remain literal text.

Matching elements move and resize between their layouts; identical layouts stay
in place. This works forward, backward, and when jumping between slides with
`none`, `fade`, `slide`, or `focus`. A slide move or focus zoom is cancelled on
matching elements so they follow their own path. Both live copies crossfade,
including any changed text or styling. Unmatched content follows the configured
slide transition; when matching elements opt a `none` transition into animation,
the rest of the slide fades. The default shared duration is 320 ms; focus uses
its configured duration, with 320 ms for shared motion when duration is zero.
Slides without matching elements retain their configured transition.

Use `<SharedElement id="title">…</SharedElement>` for custom component content.
IDs must be unique within a slide. See the focus section below for nesting,
measurement, and clipping limitations.

Try `apps/slides/examples/shared.mdx` for Markdown-only shared titles with several
slide transitions.

## Focus transitions

Mark a region on an overview slide and give matching live elements the same IDs
on the detail slide:

```mdx
<FocusRegion id="engine">
  <SharedElement id="title">

    ## The engine

  </SharedElement>
  <SharedElement id="diagram" style={{ width: 460, height: 180 }}>
    <Engine />
  </SharedElement>
</FocusRegion>

---
transition:
  type: focus
  from: engine
  duration: 850
---

<SharedElement id="title">

  # Inside the engine

</SharedElement>
<SharedElement id="diagram" style={{ width: 920, height: 420 }}>
  <Engine detailed />
</SharedElement>
```

The outgoing content zooms toward the region while matching elements move and
scale into their incoming layout. Both React trees stay live during the motion;
the destination component owns its state. Changed text and styles crossfade;
this does not preserve a single component instance across different slides or
interpolate font layout. The zoom preserves aspect ratio and covers the stage,
so a region with a different aspect ratio may be cropped.

The configuration belongs to the destination slide. Going back to its immediate
predecessor reverses that same camera move. Duration is in milliseconds (default
850); zero cuts immediately unless shared elements opt into motion. Jumping across
slides or a missing/unmeasurable focus region uses a fade, while matching shared
elements still move between their layouts. A new navigation cancels the current move and starts
from the new source slide's layout; it does not preserve intermediate velocity.
Presenter previews always show the final layout.

`FocusRegion` and `SharedElement` accept native `View` props, including `style`.
They are available directly in MDX and can be imported from
`@legend-apps/presentation` in local components. IDs must be unique within each
slide; ambiguous IDs are excluded. Nested shared elements move as part of their
outer shared element. Keep moving elements outside clipping/scroll containers
and put decorative transforms on their children: ancestor clipping and custom
ancestor transforms are not overridden. Measurements use logical slide units,
independent of audience display size. Live GPU/WebView rendering uses the same
view transforms, but those native surfaces still need platform verification.

Try `apps/slides/examples/focus.mdx` for a two-slide example with a live rotating
React Native component, a moving title, and reverse navigation.

## Steps

Step 0 is the initial slide. Step 1 is the first advance. `Step` reveals content
in document order, and `Steps` reveals each direct child or Markdown list item:

```mdx
<Steps transition="fade-up">

- Native UI
- Low memory usage
- Familiar React code

</Steps>

<Step>One more point.</Step>
```

Use `at={2}` to coordinate multiple elements on one advance, and `until={4}`
to hide content when step 4 begins. Reveals preserve layout space and hide
interaction/accessibility while invisible. Back restores the earlier state.

Property changes use explicit targets that persist until the next change:

```tsx
<Step initial={{ opacity: 1 }} states={{ 2: { opacity: 0.3 }, 4: { opacity: 1 } }}
  transition={{ duration: 300 }}>
  <Diagram />
</Step>
<Steps count={3}>{(step) => (
  <Effect active={step >= 2} shader={liquidGlass}><Demo /></Effect>
)}</Steps>
```

Numeric styles, transforms and hex colors interpolate. Other values change at
the step boundary. `transition="none"` disables interpolation.

The host infers the total from these declarations in the MDX element tree.
For steps hidden inside custom component implementations or hook-only logic,
declare the total number of states (including initial state) in frontmatter,
for example `steps: 3` for steps 0, 1 and 2.

`useStep(2)` from `@legend-apps/presentation` returns `reached`, `isCurrent`,
`elapsed` (seconds), `startedAt` and `direction`. Its clock starts when step 2
is reached, continues across later steps, and resets when navigating before it.
Preparing and previewing slides never runs that clock. Presenter previews resolve
styles immediately at their requested step. `useSlideLifecycle()` exposes the
current zero-based `stepIndex`, `stepCount`, and `stepStartedAt`.

## Templates

A deck can select a local template component by file name or path. Extensions are
optional, and the path is relative to the deck file:

```yaml
template: templates/Frame
```

The template file must default-export a React Native component. It receives the
rendered slide content as `children`, document frontmatter as `deck`, and the
current slide's frontmatter as `slide`:

```tsx
import type { PresentationTemplateProps } from "@legend-apps/presentation";
import { Text, View } from "react-native";

export default function Frame({ children, deck, slide }: PresentationTemplateProps) {
  return (
    <View style={{ flex: 1, padding: 80 }}>
      <Text>{deck.title}</Text>
      <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>
      {typeof slide.section === "string" && <Text>{slide.section}</Text>}
    </View>
  );
}
```

The deck template applies to every slide. Slide frontmatter can select another
template, or set `template: false` to use the built-in layout for that slide.
Template files follow the same local-import and host-package rules as other deck
components, are watched for live rebuilds, and are scanned for Uniwind classes.

### Full-window backgrounds

A template can declare a background once. Slides using that template need only
Markdown content—`Scene` is an optional helper specific to the example talk.

```tsx
import { Background, type PresentationTemplateProps } from "@legend-apps/presentation";
import { View } from "react-native";
import { AmbientAurora } from "./AmbientAurora";

export default function Frame({ children }: PresentationTemplateProps) {
  return <>
    <Background priority={-1}><AmbientAurora /></Background>
    <View style={{ flex: 1, padding: 80 }}>{children}</View>
  </>;
}
```

With `template: ./Frame.tsx` in deck frontmatter, a slide can simply contain:

```md
# Actually native

React Native renders real platform controls.
```

`Background` renders outside the content's aspect-ratio constraints and fills the
audience window or its presenter preview. `useBackgroundSize()` provides that
viewport's width and height for shaders and other measured drawing. Images can
fill the background with `resizeMode="cover"`. Content scales uniformly to fit;
it is never stretched or cropped to match the display.

Use priority `-1` for template defaults. A slide-level `<Background>` (default
priority `0`) overrides it; `<Background />` suppresses it and shows the deck's
base color. Keep one declaration per priority per slide. A `Scene` background
prop in the talk uses priority `1`, with `null` disabling its background.

Only the selected slide's background is displayed. The host stays outside slide
transitions and preserves a shared background component of the same type/key
across navigation, including prepared slides. For continuous animation, keep its
clock local to the background rather than resetting it from the slide's
`startedAt`. The talk's aurora follows this pattern; presenter previews use a
static frame unless live.

## Components and code

Decks may use Markdown, JSX, expressions, hooks, event handlers, and arbitrary JavaScript. They may import local `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, and image files inside the deck directory. macOS and native filename variants are preferred before generic files.

The host provides these package imports:

- `react`
- `react-native`
- `@legendapp/state`, `@legendapp/state/react`, and `@legendapp/state/sync`
- `@legendapp/motion`
- `@legend-apps/presentation`
- `@shopify/react-native-skia`
- `lottie-react-native`
- `react-native-webgpu`
- `typegpu`, `typegpu/common`, `typegpu/data`, and `typegpu/std`
- `@typegpu/noise` and `@typegpu/react`
- `react-native-webview`

`@legend-apps/presentation` exports `usePresentation`, `useSlideLifecycle`, and `defineTypeGPUScene`. Package imports outside this list, network imports, paths outside the deck directory, and symlink escapes are rejected. A deck has no package manifest or dependencies of its own.

Deck code is intentionally trusted and runs inside the app's Hermes runtime with the app's permissions. Only open decks you trust.

Uniwind scans the entire deck directory on every successful compile, so static `className` values in local components are available without adding those files to the app project.

## Content effects

The audience keeps the current slide and up to two slides on either side mounted
at the display's actual scale. Nearby slides prepare behind the visible slide
with playback paused, and are released when they leave that window. An outgoing
slide outside the window is retained until its transition completes. Skia captures
and TypeGPU scenes can therefore survive nearby forward/back navigation.
Deck components can read `isPreparing` from `useSlideLifecycle()` to distinguish
these preparation surfaces from presenter previews. Preparation is asynchronous;
a rapid advance or distant jump can still arrive before an effect has finished setup.

`Effect` can wrap static Markdown or React Native content and apply a GPU-animated Skia image filter. The built-in presets are `liquid`, `ripple`, `glitch`, and `pixelate`:

```mdx
<Effect preset="liquid" strength={14} speed={0.8} padding={24}>

# Liquid typography

</Effect>
```

Decks may provide a custom SkSL image-filter shader through the `shader` prop and additional numeric values through `uniforms`. Custom shaders receive `image` (the captured content), `resolution`, `time`, and `strength` automatically:

```mdx
export const invert = `
  uniform shader image;
  half4 main(float2 position) {
    half4 color = image.eval(position);
    return half4(1.0 - color.rgb, color.a);
  }
`

<Effect shader={invert}>
  <Text>Custom effect</Text>
</Effect>
```

Effects snapshot their content and are intentionally non-interactive. The original React Native content remains visible if capture or shader compilation is unavailable.

## TypeGPU scenes

The built-in `TypeGPU` component owns the React Native canvas, WebGPU device and
context, animation loop, presentation, error handling, and slide lifecycle. A
deck only supplies portable TypeGPU setup and rendering code:

```mdx
import { scene } from "./scene"

<TypeGPU scene={scene} width={1120} height={560} />
```

Define a scene in a local TypeScript file. `defineTypeGPUScene` provides the
host values during setup and the current texture view during each frame:

```ts
import { defineTypeGPUScene } from "@legend-apps/presentation";
import { common, d } from "typegpu";

export const scene = defineTypeGPUScene(({ format, root }) => {
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: () => {
      "use gpu";
      return d.vec4f(0.1, 0.7, 1, 1);
    },
    targets: { format },
  });

  return {
    render({ view }) {
      pipeline.withColorAttachment({ view }).draw(3);
    },
  };
});
```

The host also supplies `device`, `size`, and `isPreview` during setup. Each
frame receives `time`, `deltaTime`, `timestamp`, `frame`, `isPreview`, and
`view`. Next-slide previews render one stable frame. The presenter’s Current
view and the audience receive continuous frames with a shared slide clock. Scene instances may return `dispose()` for their
own non-TypeGPU resources.

## Current packaging constraint

The compiler path is embedded by the repository's build and development commands, so the app currently runs decks from a source checkout with Bun installed. Bundling the compiler into a distributable `.app` is separate release-packaging work.

## Presentation build (no Metro)

Build a release app on the machine you will present from, after your deck and
dependencies are ready:

```sh
bun install --frozen-lockfile
bun run slides build macos
bun run slides open macos --release -- /absolute/path/to/talk.mdx
```

This embeds the application JavaScript and the checkout's compiler path; it
does not connect to Metro. Keep this checkout and Bun available at the same
paths until after your talk, and keep all local deck files together. The app
still invokes Bun to compile decks, so this is a personal presentation build,
not a standalone app you can copy to another computer. Run the **open** command
before the talk rather than rebuilding or installing dependencies at the venue.
Quit any existing Slides process before opening this build.

Slides uses the same Apple development team as Music for local debug and
presentation builds. Install a valid Apple Development signing identity for
that team in Keychain before building. The build preserves that identity when
re-signing processed assets and Hermes. macOS may ask for Documents access once
when switching from an ad-hoc build; using the same signing identity and bundle
ID on later builds lets it recognize the app and retain the approval.

Before relying on this build, confirm it actually opens your deck with Metro
stopped. A successful native build alone is not a passing rehearsal. If deck
compilation times out, compare with `bun scripts/compile-slides.ts <deck.mdx>`
and check for macOS file-access prompts for Legend Slides, especially when the
checkout or deck is in Documents. Do not grant Full Disk Access as a blanket
workaround; investigate the specific file-access failure first.

Use the [rehearsal checklist](REHEARSAL.md) to validate the actual talk before
presenting. It includes the current verification status and remaining checks.

### Speaker notes for steps

The presenter counter shows `3 / 65 · Step 2 / 3`. These display numbers are
one-based: step 1 is the initial slide state, step 2 is the first advance.

Prefix speaker-note sections with `1:`, `2:`, etc. (also `1.` or `1)`):

```md
<!--
A reminder that applies throughout the slide.

1: Describe the convincing glass before starting the animation.

2: Start the escalation. Let the audience watch it get ridiculous.
-->
```

The current section stays at full opacity; other numbered sections dim to 0.75.
A section continues until the next numbered prefix, including multiline prose.
Notes before the first prefix remain fully visible. Numbered lines inside fenced
code and timestamps such as `8:10` are not step markers. Prefixes work across
separate comments too, since comments are collected into the slide's notes.

Editing shows the complete original Markdown at full opacity. Note markers only
highlight existing steps; use `Step`, `Steps`, animation triggers, or slide
frontmatter `steps` to define the slide's navigation states.

### Liquid glass focus

`LiquidGlass` captures its children using the same snapshot path as `Effect`.
Its `active` prop animates between clear and frosted, revealing a sharp overlay.
Use a `Steps` render function to connect that state to presentation navigation:

```mdx
<Steps count={2}>{(step) => (
<LiquidGlass active={step >= 1} blur={24} refraction={8} duration={700}
  overlay={<Text>Focus on what matters.</Text>}>
  <ComparisonChart />
</LiquidGlass>
)}</Steps>
```

`active` defaults to `false`. `blur` and `refraction` are logical pixels;
`duration` is milliseconds. `variant="frosted"` is the default; `variant="liquid"`
adds a stronger ripple as the glass forms. Both settle after the transition.
Going backward clears the glass; changing direction mid-transition starts from
the current amount. The optional overlay fades with the glass but remains sharp.
Use `style` for the wrapper's size or corner radius. Content needs intrinsic or
explicit dimensions. Like `Effect`, this captures static native content rather
than providing a live backdrop blur over interactive controls.


### Steps as state

`Steps` also accepts a render function, receiving the current zero-based slide
step. Components receive their own ordinary props; Slides does not inject or
animate child props.

```mdx
<Steps count={3}>
  {(step) => (
    <LiquidGlass active={step >= 2} overlay={<Text>Now focus here.</Text>}>
      <Chart highlighted={step >= 1 ? "memory" : undefined} />
    </LiquidGlass>
  )}
</Steps>
```

`count` is the total number of states, including initial step 0. It defaults to
2 for render functions. The callback sees the slide's global step, so multiple
`Steps` blocks coordinate rather than advancing independently. The host combines
counts with other reveal declarations using the maximum, not their sum.
Callbacks are opaque during discovery: declare enough states for everything
inside them using `count`. For example, `count={3}` supports steps 0, 1, and 2.
Presenter previews pass their requested step; backward navigation passes the
earlier value. Components own their transition and reversal behavior.

The existing `<Steps>` Markdown list syntax still reveals each item in order.
`Effect active={...}` replaces `startOnStep`: inactive effects show their initial
frame; activation starts the clock, which continues while active and resets when
deactivated. `LiquidGlass active={...}` owns its smooth reversible frost transition.

## Markdown attributes

Add attributes at the end of a heading or paragraph. Multiple attributes share
one pair of braces, for example `## Title {shared=title step=1}`. Code fences,
inline code, and escaped braces stay literal.

### Reveal a block

`Text {step=1}` appears on the first advance. `{step=0}` is visible initially.
Blocks with the same step appear together; navigation counts are inferred.
Reveals preserve layout space, and backward navigation restores earlier states.

### Hide a block

`Text {step=1 until=3}` appears at step 1 and disappears when step 3 begins.
`Text {until=2}` starts visible and disappears at step 2. `until` must be greater
than `step`; both are non-negative integers. Backward navigation reveals the
content again, and the exit step counts toward the slide's navigation states.
