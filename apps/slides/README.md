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

Transitions are `none`, `fade`, or `slide`. The deck default is `none`, and slide frontmatter may override it.

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

## Components and code

Decks may use Markdown, JSX, expressions, hooks, event handlers, and arbitrary JavaScript. They may import local `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, and image files inside the deck directory. macOS and native filename variants are preferred before generic files.

The host provides these package imports:

- `react`
- `react-native`
- `@legendapp/state`, `@legendapp/state/react`, and `@legendapp/state/sync`
- `@legendapp/motion`
- `@legend-apps/presentation`
- `@shopify/react-native-skia`
- `react-native-webgpu`
- `typegpu`, `typegpu/common`, `typegpu/data`, and `typegpu/std`
- `@typegpu/noise` and `@typegpu/react`
- `react-native-webview`

`@legend-apps/presentation` exports `usePresentation`, `useSlideLifecycle`, and `defineTypeGPUScene`. Package imports outside this list, network imports, paths outside the deck directory, and symlink escapes are rejected. A deck has no package manifest or dependencies of its own.

Deck code is intentionally trusted and runs inside the app's Hermes runtime with the app's permissions. Only open decks you trust.

Uniwind scans the entire deck directory on every successful compile, so static `className` values in local components are available without adding those files to the app project.

## Content effects

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
`view`. Presenter previews render one stable frame; the active audience slide
receives continuous frames. Scene instances may return `dispose()` for their
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
