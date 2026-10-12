# Backgrounds

Import individual entries such as `slides:backgrounds/Droplets`, `AmbientAurora`,
`Fluid`, `Wireframe`, `GlassAtmosphere` or `TypeGPUGlassBackground`.
The optional `AnimatedAtmosphere` chooser imports its full variant source set;
use an individual entry when the deck needs only one variant. Skia compilation
is deferred until rendering rather than performed when the module is imported.

Use the host `Background` to own background priority and intensity. These effects
read host dimensions and playback; previews have deterministic poses. Where an
entry accepts speed/brightness, those affect its visual rather than creating a
separate timer. `Droplets` also accepts the existing shared-uniform contract for
advanced compositions. `DropletGeometry`, `DropletMaterial` and `DropletField`
are public shader helpers used by the liquid-title example. Glyph masks, feeding,
absorption, captured byline text and title choreography stay with that example.
