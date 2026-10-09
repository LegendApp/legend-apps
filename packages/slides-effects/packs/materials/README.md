# Glass and destruction

`GlassPanels` draws supplied rounded rectangles into one surface, using a bounded
shader cache. Geometry, size, breathing, edge motion, eligibility and RGB tint are
caller inputs. `BranchMaterial` exports the lit ribbon shader fragment.
`Distortion` supplies prismatic tear, soft ripple and timing inputs for host effects.
`Refraction` supplies `createRefractionShader`, which takes normalized region uniforms
through the host `Effect`, optional radii and an optional explicit ramp. Without a
ramp it uses steady material strength; gallery region/timeline defaults stay local.

`GlassStrike` draws glass, the two impact strokes, falling shards, chips and sparks,
and optionally a success check. Supply canvas bounds/style, `centerX`, panel height,
phase and a slide/step/numeric `trigger`. `geometry` controls vertical origin,
width, radius, scale, stroke endpoints and strike/check colors. Keep its native
bounds stable while crossing a panel. `createGlassStrikeShader` lets a composition
use the same material in a host `PresentationCanvas`, including density caps.

`ImageShatter` takes a source URI, image dimensions, camera center/scale, corner
radius and `revealAtStep`. The image arrives on that step, shatters on the next,
then becomes transparent. It uses 40 analytic fragments and the shared step clock.
Supply surface bounds/style for the falling area; no screenshot is bundled.

`Fire` exports `Flames` and `FallingSprites`. Supply emission position, width and
bar height; supply an image URI only for falling sprites. Flames rise over five
seconds and use a bounded image-free surface. Sprites fall, splash and accumulate
at the logical slide floor measured from the host focus surface. The default
sprite coordinate space is 256×256; the image is fitted into it. Both use the
shared step clock. Talk labels, sprite choice and layering stay with the caller.

These effects retain analytic fragment bounds and bounded shader caches. They
are optional effects, not a blanket frame-rate guarantee for arbitrary geometry.
