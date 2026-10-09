# Media composition

`slides:media/AppCarousel` takes `items`, `position`, `renderCard` and optional
overlay/poster callbacks. IDs must be unique and stable. `mode` selects hero,
grid or filmstrip. `geometry` controls center, spacing and grid dimensions;
`cardWidth` controls card size. Defaults preserve the original 1920×1080 talk.
Pass explicit geometry for another stage. The item count comes from the caller.

`FilmstripMotionView` exposes native placement and exit separately. It accepts a
shared progress value and configurable spacing. `CarouselBlurView` retains queued
readbacks, 512px textures, bounded shared leases, poster composition and a live
fallback. Both remain driven by the presentation clock and native navigation.

`PosterVideo` takes a video `source` and `poster`, loads on first selection, stays
mounted when paused and reuses a retained shared playback `position`.
`RecordingPositionContext` provides carousel-owned positions to nested players;
an explicit position overrides that context. Recordings, file extensions, names,
captions and overlay choreography belong to the deck. Video decoding remains a
host capability, not part of this source pack.
