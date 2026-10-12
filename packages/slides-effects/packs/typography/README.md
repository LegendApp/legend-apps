# Animated titles

Import `AnimatedTitle` from `slides:typography/AnimatedTitle` and supply text as
children. Set `width`, `fontSize`, `textStyle`, `color` and `wrap` for your stage.
`clock` selects slide or step time; the host controls preparation, pause, preview,
outgoing poses and re-entry. The implementation has no JavaScript frame loop.

`effect` selects one of 16 entrances: `soft-rise`, `word-lift`, `letter-wave`,
`center-out`, `tracking-collapse`, `split-arrival`, `zipper`, `elastic-drop`,
`hinge`, `spin-in`, `scatter`, `stretch-release`, `typewriter`, `wipe`, `curtain`
and `chromatic-glitch`. `TitleEntrances` exposes their worklet pose functions for
custom title compositions. Text and word/letter ordering come from the caller;
captured liquid text, bylines and glyph absorption remain talk-specific.

For a concise deck vocabulary, start with `soft-rise`, `word-lift`,
`split-arrival` and `wipe`. The other 12 presets remain available for
stronger or more specialized entrances.
