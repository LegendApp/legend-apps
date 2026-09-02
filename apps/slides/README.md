# Legend Slides

Legend Slides presents trusted local `.mdx` decks in a React Native macOS app. The presenter window shows the current slide, optional next-slide preview, speaker notes, build output, and the available displays. The audience window can run as a normal rehearsal window or borderless on a selected display.

## Run the sample

From the repository root:

```sh
bun run slides run macos -- apps/slides/examples/showcase.mdx
```

Bun compiles the deck when it opens and whenever a file in the deck directory changes. A failed rebuild leaves the last successful deck on screen and reports the error in the presenter window.

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
---

# First slide

<!-- Speaker notes can appear anywhere in a slide. -->

---
transition: slide
---

## Second slide
```

Transitions are `none`, `fade`, or `slide`. The deck default is `none`, and slide frontmatter may override it.

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

`@legend-apps/presentation` exports `usePresentation` and `useSlideLifecycle`. Package imports outside this list, network imports, paths outside the deck directory, and symlink escapes are rejected. A deck has no package manifest or dependencies of its own.

Deck code is intentionally trusted and runs inside the app's Hermes runtime with the app's permissions. Only open decks you trust.

Uniwind scans the entire deck directory on every successful compile, so static `className` values in local components are available without adding those files to the app project.

## Current packaging constraint

The compiler path is embedded by the repository's development commands, so the app currently runs decks from a source checkout with Bun installed. Bundling the compiler into a distributable `.app` is separate release-packaging work.
