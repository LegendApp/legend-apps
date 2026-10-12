# Particles

`GlowField`, `Constellation` and `InterfaceReveal` export their
default programs and configurable factories. A factory returns `{ program,
particleCount }`; pass both to the host `TypeGPUShader` with `particles` enabled.
Keep those values paired, especially for GlowField's storage-backed compute pass.

All factories accept `particleCount` (1–16384), shared-clock `speed` and geometric
`scale`. Constellation adds row count; InterfaceReveal adds column count and draws
an illustrated interface, not live content. GlowField adds two RGB palette colors.
`createInterfaceReveal` also accepts `intensity` from 0 to 1 (default 1);
it scales assembly speed and the fraction of visible points.
Surface width/height and preview time belong to the host renderer. Defaults retain
the desktop talk/gallery poses. These are optional programs, not throughput claims.
No renderer, frame submission loop or native dependency is bundled.

`TrajectoryEmitter` repeats caller-supplied native keyframe paths, with configurable
start, interval, initial one-shot emissions, preview time and slide/step clock.
Supply content through `renderParticle`. Routes must have at least two keyframes;
reuse stable route arrays and logical ordering. Use unique caller content for
labels, images or emoji. Timing and outgoing/paused poses belong to the existing
host keyframe engine, so no JavaScript timer selects lanes or emits frames.
