# Legend Slides

## Animation policy

- Never implement JS-driven animations in Slides, including deck-local components and shared presentation code used by this app.
- Use GPU-backed animation with per-frame work running outside the JavaScript thread: for example, host-compiled Reanimated worklets, native-driven animations, or GPU shaders. JavaScript may set targets and start or stop animations, but must not calculate or send animation updates every frame.
- Do not use `requestAnimationFrame`, timers, React state updates, observable updates, or React Native Animated with `useNativeDriver: false` to drive animation frames. Rendering a shader does not make a JS-driven uniform-update loop acceptable.
- If a requested effect can only be implemented with JS-driven animation, push back: explain the limitation and propose a GPU-backed alternative. Do not silently fall back to JS animation.

## Shared animation timing

- Use the presentation playback controller for slide/step animation time. Use `useAnimatedShaderUniforms` for shaders, `SceneMotionView` for native poses, and `PlaybackKeyframeView` for native trajectories.
- For new host-compiled worklets, sample `usePlayback()` with `samplePlayback`. Keep slide time (entrance/ambient motion) separate from step time (a reveal or triggered effect).
- Do not read a shared clock on JS to capture a start timestamp, or create independent clocks for pieces of one effect. The controller publishes navigation identity and clock resets together on the UI thread.
- Preparation samples zero; previews sample a fixed time; playback begins at zero; outgoing content freezes its last live frame. Never treat an outgoing slide as a thumbnail.
- Obtain playback hooks outside Skia's Canvas reconciler and pass derived uniforms into the Canvas. Extend the shared lifecycle tests when adding a new reset or handoff behavior.

## Slide text density

- Prefer fewer words. Do not add small explanatory subtitles, footnotes, or captions beneath diagrams, cards, or charts unless explicitly requested. Put supporting explanation in speaker notes; retain labels needed to identify the visual elements.
