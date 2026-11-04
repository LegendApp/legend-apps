# Slides scene props

`Scene` and its parts from `slides:world/Authoring` take these props directly in MDX.
Every one is optional; leaving it out keeps the default shown. Times are seconds, positions are
world units, and `step` is the scene's own step (0 is the first). See
`apps/slides/examples/3d/scene-props.mdx` for a deck that uses each of them.

## Errors

Props are checked when a deck first shows one of its scenes. An error names the deck file and line, the element and the
prop, and suggests the right name for a near miss:

```text
talk.mdx:16: <Headline id="title"> enter.duration must be a number of seconds > 0 (got 0).
talk.mdx:9: <Scene id="intro"> Unknown prop camera.steps[2].durtion. Did you mean camera.steps[2].duration?
```

The deck compiler adds `mdxSource="file.mdx:line"` to elements imported from a pack's `Authoring`
module. Other props pass through to World unchanged.

## Camera

| Prop | Default | Meaning |
| --- | --- | --- |
| `camera.duration` | `1.7` | Flight time into this slide's station |
| `camera.ease` | `"cubic"` | Flight easing: `linear`, `cubic`, `out`, `smoothstep`, `expo`, `spring` |
| `camera.via`, `camera.viaTarget` | a rise above the lane | Control points that bend the flight's curve |
| `camera.position`, `camera.target` | the layout's | The station camera |
| `camera.carry` | none | How shared parts fly: `lift`, `spread`, `spin`, `stagger` (0–0.9) |
| `camera.steps` | none | Per step: `orbit` (degrees), `dolly`, `shift`, `fov`, `duration`, `ease` |

A step move's `ease` falls back to `camera.ease`.

## Parts: enter, exit and carry

| Prop | Default | Meaning |
| --- | --- | --- |
| `enter` | `{ step: 0, delay: 0, duration: .8, ease: "cubic", from: [0,-6,0] }` | Moves the part in from the offset `from` |
| `exit` | `{ delay: 0, duration: .8, ease: "cubic", to: [0,0,-40] }`; `step` is required | Moves the part away by `to` on `step` |
| `carry` | `true` | `false` stops a same-id part from the previous slide flying into this one |

Text parts (`Headline`, `Quote`) keep their glyph-by-glyph entrance: `enter` sets its `step`,
`delay`, `duration`, `ease`, `stagger`, `scale` and start offset `from` (default `[-8,0,-2]`), and `exit`
also fades the text out. `delay` and `duration` on the part stay shorthands for its entrance.

## Theme and colors

`colors` on a `Scene` sets the theme of its parts. Its keys and their defaults are `text` `#eef0f3`,
`muted` `#7d838c`, `idle` `#5b616b`, `accent` `#ff3a1c`, `hot` `#ffa21f`, `link` `#4aa8ff`,
`added` `#39d98a`, `removed` `#ff3a1c` and `highlight` `#be91ff`. A part's color prop takes a hex
color or one of those names, as in `<Rule color="accent" />`.

## Code panels

| Prop | Default | Meaning |
| --- | --- | --- |
| `size`, `lineHeight` | `.165`, `.3` | Text size and line spacing |
| `padding` | `.3` | Space between the text and the panel's edge |
| `fill` | `.75` | Panel opacity, from 0 to 1 |
| `panelColor`, `textColor` | the World defaults | Panel and text colors |
| `anchor` | top left | `"center"` centers the panel on `at` |
| `marks` | none | `[{ text, color, step, delay }]` highlights each match of `text` |

## Charts

`Bars` takes `items={[{ label, value, color }]}` and these style props:

| Prop | Default | Meaning |
| --- | --- | --- |
| `max` | the largest value | The value of a full-height bar |
| `height`, `width`, `depth` | `4.3`, `1.5`, `width` | Bar size |
| `gap` | `3.4` | Distance between bar centers |
| `color` | World's bar color | Color for items without their own |
| `delay`, `stagger`, `duration`, `ease` | `1`, `.35`, `1.6`, `"out"` | Rise timing |
| `labelSize` | `.44` | Label text size |

## Ambient effects

`ambient` on a `Scene` adds an effect, or a list of them, to the scene:
`"dust"` (drifting specks), `"trails"` (streaks along the floor), `"orbs"` (glowing spheres)
and `"fog"`. The object form takes options: `{ effect: "dust", count, color }`,
`{ effect: "orbs", count, color }`, `{ effect: "fog", density, color }` and
`{ effect: "trails", length }`. Fog defaults to the scene's `backgroundColor`.
