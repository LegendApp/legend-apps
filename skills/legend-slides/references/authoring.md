# Native Markdown authoring reference

Contents: deck configuration · Markdown · layout · steps · notes · shared/focus · assets.
This reference targets the Legend Slides source in `LegendApp/legend-apps`.
When using a different checkout version, its compiler and renderer are authoritative.

## File format and configuration

Use `.mdx`, including for Markdown-only decks. Initial YAML frontmatter configures
the deck. A top-level `---` starts a slide. To configure that slide, follow the
separator with YAML and a closing `---`. Imports/exports are document-level.
Do not put separators inside layout containers or JSX examples.

```mdx
---
title: Product update
width: 1920
height: 1080
transition: fade
theme:
  backgroundColor: "#0b1220"
  color: "#f8fafc"
presenter:
  showNext: true
  showNotes: true
---

# First slide

<!-- A private presenter reminder. -->

---
transition: slide
steps: 3
---

# Second slide

Visible on the first advance. {step=1}
```

| Deck field | Meaning / default |
| --- | --- |
| `title` | Presentation title |
| `width`, `height` | Logical stage size. Width defaults to 1920; height defaults to width divided by aspect ratio |
| `aspectRatio` | Ratio string such as `16:9` or `4/3`; default 16:9; explicit height wins |
| `transition` | `none` (default), `fade`, `slide`, or focus object |
| `theme.backgroundColor` | Base color; default `#111827` |
| `theme.color`, `theme.fontFamily` | Native Markdown text styling; font must be available on the presenting machine |
| `presenter.showNext`, `presenter.showNotes` | Set false to hide the respective pane; otherwise shown |
| `template` | Local default-export component path, extensions optional |
| `background` | Local image path or false |

Slide fields: `transition`, `steps`, `template` (path or false), `background`
(path or false). Other slide metadata is passed to the template, not magically
rendered. `steps` is the total state count, including initial state 0. Per-slide
`theme`, `width`, and `height` are not implemented as overrides.

Content scales uniformly to fit the display. Templates own content padding;
the built-in slide content has 120 horizontal and 80 vertical padding. Full-window
backgrounds live outside the aspect-constrained content stage.

## Supported Markdown and native rendering

Use headings `#` through `###`, paragraphs, bold, italic, links, blockquotes,
inline code, fenced code, and lists. Ordered and unordered list items currently
render with bullet markers. The parser accepts GFM but the native component map
does not implement every GFM tag: do not rely on tables, task-list checkboxes,
strikethrough, headings 4–6, or Markdown image syntax without checking the renderer.
Use native layout containers for tables/cards and explicit `Image` components.
HTML elements such as `div`, `span`, or `iframe` are not native slide primitives.

Code fences use a native syntax viewer. Recognized language names:
`bash`, `c`, `cpp`, `css`, `dockerfile`, `go`, `html`, `java`, `javascript`, `js`,
`json`, `jsx`, `kotlin`, `markdown`, `md`, `python`, `ruby`, `rust`, `scss`,
`shellscript`, `sh`, `swift`, `toml`, `tsx`, `typescript`, `ts`, `xml`, `yaml`,
`yml`, `zsh`. Unknown or omitted languages display without the selected language's
highlighting. There is no built-in Mermaid/LaTeX diagram renderer.

## Trailing attributes

Put attributes at the END of a heading or paragraph, in one brace pair:

```md
## Our product {shared=product step=1 class="text-cyan-300 text-5xl"}

More detail {step=2 until=4 effect=ripple}
```

| Attribute | Behavior |
| --- | --- |
| `class="..."` | Static Uniwind native text classes, applied after defaults/theme |
| `step=N` | Show at zero-based state N; non-negative integer |
| `until=N` | Hide at state N; must exceed step; alone starts visible |
| `shared=id` | Match the whole block across slides |
| `focus=id` | Name the bounds of this block as a focus region |
| `effect=...` | `liquid`, `ripple`, `glitch`, `pixelate`, using host defaults |

IDs allow letters, numbers, underscores, dots, hyphens; quoted IDs work.
Attributes do not target individual inline spans or list items. Code and escaped
braces stay literal. For a whole section, put the attributes on a group container.

## Layout containers

No space after the colon fence or before the attributes. Nest using longer outer
fences, and close each fence before a slide separator:

```md
::::columns{ratio="2:1" gap=40 align=center}

:::group{padding=32 class="bg-slate-800 rounded-3xl" shared=card}

## Main idea

Supporting text.

:::

:::stack{gap=24 height=320 justify=between}

### Details

One column may contain several blocks.

:::

::::
```

- `group`: several vertical blocks treated as one unit for placement/animation.
- `stack`: vertical composition; currently the same layout behavior as group.
- `columns`: each direct block occupies one column; equal widths by default.
  `ratio="2:1"` specifies positive weights, exactly one per direct column.
- `grid`: equal-width cells, row-major; `columns=3` sets count (default 2, range
  1–12). Incomplete final rows retain equal widths. Cell height follows content;
  give cards explicit heights when they must match.

All accept `gap` (24 default), `padding` (0), `width`, `height`, `align`, `justify`,
and `class`. Numeric dimensions use logical slide units, independent of screen
pixels. Width/height also accept percentages. Gap/padding are non-negative.
`align`: start/center/end/stretch. `justify`: start/center/end/between/around/evenly.
Columns have a horizontal main axis; group/stack have a vertical main axis.
Grid rows are horizontal. Explicit attributes override classes, which override
defaults. Give a container spare height/width for justification to distribute.

A heading and paragraph are TWO cells unless grouped. Groups accept `shared`,
`focus`, `step`, `until`, and `effect` too. Nesting layouts does not require JSX.
Invalid attributes, missing fences, bad ratios, and separators inside containers
are compiler errors. Editor/next previews warn for detected container bounds
outside the stage; this is not a comprehensive text-overflow validator.

## Reveals and presentation states

```md
{steps}

- First advance
- Second advance
  - Nested bullet appears with its parent
```

`{steps}` is a standalone directive immediately before a list; it cannot be
combined with step/until. Lists consume sequential steps in document order.
Blocks with explicit matching step numbers reveal together. Reveals retain layout
space and disable interaction/accessibility when hidden; reverse navigation
restores earlier states. Exit steps contribute to the state count.

Use `<Step at={2} until={4}>...</Step>` for arbitrary content. Without `at`, steps
are allocated in document order. Transition choices are `fade`, `fade-up`,
`slide-up`, `none`, or `{ duration: 300 }` (milliseconds). `initial` and `states`
can specify ViewStyle targets; numeric styles, transforms, and hex colors animate.
Other values change at the boundary.

```mdx
<Steps count={3}>{(step) => (
  <LiquidGlass active={step >= 1} overlay={<Text>Focus here</Text>}>
    <View style={{ height: 400 }}><Text>Original detail</Text></View>
  </LiquidGlass>
)}</Steps>
```

Render functions get the slide's GLOBAL step. `count` includes state 0 and defaults
to 2 for render functions; multiple counts combine by maximum, not sum. The host
cannot inspect inside component implementations or callbacks. Supply a sufficient
`count` or slide `steps` for hidden step logic. Do not use obsolete `startOnStep`.

## Speaker notes

HTML comments become presenter notes, not audience content. `<!-- ... -->` is
supported directly in MDX. Each slide collects its comments. For step cues:

```md
<!--
General reminder.

1: Explain the initial state.

2: Advance and describe the reveal.
-->
```

Notes/counters are ONE-based, unlike code's zero-based steps. `1.`, `1)` work too.
Unnumbered introductory notes stay highlighted. Timestamps like `8:10` and numbers
inside fenced code are not markers. Notes do not create navigation states.

## Shared elements and focus

Repeat `{shared=title}` on two slides for independent movement and resizing.
Same geometry stays in place. Works forward/back/jumps regardless of the selected
slide transition. Both live copies crossfade; component state is not transferred
and font layout is not continuously interpolated. Unmatched content follows the
slide transition; with `none`, shared motion causes other content to fade.
Default shared motion: 320 ms. IDs must be unique per slide; duplicate IDs are
excluded. Nested shared elements move with their outer shared element.

Focus is configured on the DESTINATION slide:

```mdx
:::group{focus=engine}

## The engine {shared=title}

Native ownership, small requests.

:::

---
transition:
  type: focus
  from: engine
  duration: 850
---

# Inside the engine {shared=title}
```

The source region is zoomed to cover the stage; aspect mismatch may crop.
Immediate backward navigation reverses the camera. Missing/unmeasurable regions
or nonadjacent jumps fall back to fade; matched shared elements still move.
Focus duration defaults to 850 ms; zero cuts unless shared elements opt into
motion. Previews show final layouts. New navigation cancels the current move.
Avoid clipping/scroll ancestors; put decorative transforms on children of moving
wrappers. GPU and Webview surfaces require native runtime verification.

## Images

Frontmatter `background: ./images/photo.png` uses full-window cover sizing;
`false` suppresses an inherited background. Allowed: PNG/JPEG/GIF/WebP. Paths must
exist beneath the deck directory, including after resolving symlinks. No absolute
paths or URLs in this field. Background priority is 0, above template defaults -1.

For content images, import an asset and give the native Image dimensions:

```mdx
import photo from "./images/photo.png"

<Image source={{ uri: photo }} style={{ width: 960, height: 540 }} resizeMode="contain" />
```

The compiler resolves PNG/JPEG/GIF/WebP/SVG imports to file URLs. SVG import
resolution does not guarantee native Image can render SVG; use a raster image or
an appropriate supported renderer. Keep all assets with the deck.
