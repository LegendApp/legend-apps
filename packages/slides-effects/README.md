# Optional Slides effects

These are source packs, separate from the presentation engine and the app entrypoint.
There is no catalog import in Slides and no native runtime in a pack. A deck bundles
only the entrypoints it imports, using the host's React Compiler, TypeGPU transform
and Reanimated worklet serialization.

```tsx
import { AnimatedTitle } from "slides:typography/AnimatedTitle";
import { GlassPanels } from "slides:materials/GlassPanels";
import { Droplets } from "slides:backgrounds/Droplets";
import { AttentionStage, AttentionTarget, Spotlight } from "slides:presenting/Attention";
```

Each `packs/<id>/pack.json` declares its version, host API version and public
entrypoints. Relative helpers stay inside that pack. Decks cannot use a pack
reference to import arbitrary files outside their own directory. Selected pack
manifests and source files are compiler dependencies, and the native app watches
those pack directories. CSS scanning includes selected pack roots.
Cross-pack imports must declare the exact installed dependency version in the
importing manifest. A missing declaration or incompatible version fails compilation.

In a source checkout, the compiler finds this `packs/` directory. An installed app
looks in `~/Library/Application Support/Legend Slides/effects/`. A caller can
override the root with `LEGEND_SLIDES_EFFECT_PACKS` or the compiler's
`--effect-packs <directory>` option. Install source folders under that root with
the same `<id>/pack.json` layout before opening a talk. Source is trusted code with
the same host API access as a local deck component.

The native app and shipped compiler intentionally omit these implementations.
Downloading, version pins, capability negotiation and installation UI are future
work. Pack versions describe a source snapshot; they do not yet lock a deck to
that version. Keep packs installed for offline presentation. The current runtime
entries contain no bundled talk videos, recordings, screenshots or demo Lottie
assets. They require the host capabilities named in their manifests; initial
runtime validation targets macOS. Do not assume every entry has a static-web or
mobile equivalent.

Use explicit stage geometry (`width`, `height`, panel bounds, title width/font)
to fit a talk. Examples and advanced scene choreography remain in `legend-talks`.
Typography includes 16 entrances. Backgrounds have individual entrypoints plus an
optional `AnimatedAtmosphere` chooser. Presenting tools include measured attention,
callouts, code walkthrough, comparison, detail, layers, content replacement and a
controlled freeze clock. Hidden children must manage their own playback eligibility;
opacity alone does not stop their work.
Charts, media, Lottie, destruction, particle programs and branching ribbons are
also independently addressable. See each family's README for content and geometry
contracts. Refraction and distortion are shader entrypoints for the host `Effect`;
the gallery's region defaults and escalating timeline stay with its example.

Tests run through `bun run test:slides`. The lifecycle suites exercise preparation,
static previews, step changes, pause, outgoing frames and re-entry, including
compiled worklet closures. Packs use the host clock; they must never introduce a
JavaScript animation loop.

`materials/ImageShatter` and `materials/Fire`'s falling sprites use textured
TypeGPU instances through `GPUShader` from `@legend-apps/presentation`. The Slides
host supplies its renderer with `GPUShaderProvider`; unsupported browsers and
hosts without that provider retain the Skia rendering. Flames remain in Skia.
`materials/GPU` supplies the shared frame declaration and small WGSL geometry
helpers for deck-local programs. Image textures are decoded and uploaded once
during preparation, never on animation frames.
