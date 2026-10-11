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

Decks resolve verified source snapshots from
`~/Library/Application Support/Legend Slides/effects/`, including in a source checkout.
To compile against this `packs/` directory while developing effects, set
`LEGEND_SLIDES_EFFECT_PACKS` or pass `--effect-packs <directory>` to the compiler.
Source is trusted code with the same host API access as a local deck component.

The native app and shipped compiler omit these implementations. The gallery at
`https://legend.so/slides/effects/` installs small family packs and their exact
versioned dependencies. Opening a deck with missing packs offers installation
and retry; compilation itself never downloads code. Keep the generated
`<deck>.effects.lock.json` beside the deck to preserve checksums and versions.
Installed packs and pinned decks work offline, and upgrades coexist with older
versions. Installation is disabled during presentation.

The runtime entries contain no bundled talk videos, recordings, screenshots or
demo Lottie assets. They require the host capabilities named in their manifests;
initial runtime validation targets macOS. Do not assume every entry has a
static-web or mobile equivalent.

`catalog.json` describes curated gallery entries. Self-contained examples live in
`examples/<slug>/example.mdx`. The Legend Docs release script compiles those
examples against immutable archived packs before publishing the catalog. Bump a
pack version when runtime source changes; published checksums cannot be replaced.

Use explicit stage geometry (`width`, `height`, panel bounds, title width/font)
to fit a talk. Talk-specific choreography remains in `legend-talks`.
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

## Recording gallery previews

`bun run effects:record <slug> --apply` uses the catalog entry's optional
`recording` profile for `seconds`, playback-relative `motion` intervals, and
verifier `noiseDb` / `freezeMs`. CLI duration and motion flags take precedence.
Reveal windows use completed keyboard-command times. Sparse native sample
timestamps survive export without frame resampling. Step-less defaults skip the
first 600 ms; finite entrances keep explicit early windows. Freeze-frame checks
a crop of the moving orbit before the pause; bar-row inspects the thin bar.
Spotlight changes its target instantly and cannot pass a continuous-motion check. Smoke and aurora inspect the
moving left edge; their small frame differences need a more sensitive -80 dB noise
threshold and 300 ms (smoke) / 400 ms (aurora) accumulation window. Fluid also uses
-80 dB. These profiles were calibrated against native clips; the verifier
regression checks that each rejects a frozen export. Longer background captures show the designed slow motion without speeding
up the recording. Run that regression with `LEGEND_VIDEO_RECORDING_SKILL` set to
the video-recording skill directory.
