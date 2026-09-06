# Effect packs

These folders are local pack prototypes. They keep reusable visuals separate from
the talk's content while the plugin resolver is designed.

The proposed installed-pack namespace is `slides:`:

- `slides:backgrounds/ambient-aurora`
- `slides:distortion/prismatic-tear`
- `slides:glass/liquid`
- `slides:jay/absurd-glass` for a third-party pack

`slides:` is a virtual import prefix, not an npm scope. A future plugin resolver
can map it to trusted installed pack roots and bundle the selected modules into a
deck. These local prototypes use relative imports today, so they need no install
step or native rebuild.

Distortion shaders accept timing uniforms from `distortionTiming()`:

```ts
distortionTiming({
  delaySeconds: 3,
  durationSeconds: 0.34,
  intervalSeconds: 8.5,
});
```

This keeps effect strength separate from when and how often the effect runs.
