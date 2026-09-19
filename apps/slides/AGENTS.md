# Legend Slides

## Animation policy

- Never implement JS-driven animations in Slides, including deck-local components and shared presentation code used by this app.
- Use GPU-backed animation with per-frame work running outside the JavaScript thread: for example, host-compiled Reanimated worklets, native-driven animations, or GPU shaders. JavaScript may set targets and start or stop animations, but must not calculate or send animation updates every frame.
- Do not use `requestAnimationFrame`, timers, React state updates, observable updates, or React Native Animated with `useNativeDriver: false` to drive animation frames. Rendering a shader does not make a JS-driven uniform-update loop acceptable.
- If a requested effect can only be implemented with JS-driven animation, push back: explain the limitation and propose a GPU-backed alternative. Do not silently fall back to JS animation.
