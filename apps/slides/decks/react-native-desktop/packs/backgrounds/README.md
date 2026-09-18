# Animated backgrounds

In `../../RNConnection.tsx`, change the background inside `<Background>`:

```tsx
<AnimatedAtmosphere variant="fluid" brightness={1} speed={1} />
```

- `variant`: `"glass"`, `"fluid"`, `"smoke"`, or `"wireframe"`. Unknown values fall back to Fluid.
- `brightness`: light multiplier; `0` is black, `0.5` is half brightness, `1` is the designed level
- `speed`: overall motion multiplier; `0` pauses, `0.5` is half speed, `2` is double speed. All variants use the same steady clock rate and shader time scale.
- `slideChangeBoost`: extra speed on slide changes, scaled by `speed`. By default it adds twice the idle speed, so the peak is 3× steady motion for every variant. The burst reaches peak speed in 120 ms, then decays with a long, soft tail, returning to idle at 3.5 seconds. Set `0` for constant drift. Chart steps do not trigger it.

You can also import `Fluid`, `Smoke`, or `Wireframe` from this directory and pass the same brightness/speed props. Copy this background pack into another deck to reuse it. `AmbientAurora` remains available with its existing `intensity` and `baseBrightness` props.

These are procedural Skia shader effects, not recorded videos or physics simulations. Glass shades a continuous full-screen rippling sheet with broad, dim silver-blue reflections; it does not refract slide content. Fluid uses warped noise and lit contour ridges; Smoke uses drifting layered noise; Wireframe uses a continuously deformed mesh. Their center stays dark for slide content. The host's Reanimated UI-thread clock drives shader time without per-frame JS/React updates. Presenter previews stay static while the audience view animates, and the persistent background continues across slides. The clock integrates speed continuously, so changing speed does not reposition the pattern. Pausing holds the current frame. Aurora retains its original constant clock rate.
