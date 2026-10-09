# Legend Slides web export

Export ReactCon from the repository root:

```sh
bun packages/slides-web/export.ts apps/slides/decks/react-native-desktop/reactcon.mdx --out dist/reactcon
python3 -m http.server 4330 --directory dist
```

Open `http://localhost:4330/reactcon/`. Upload the generated directory to any static HTTP host; it also works under a URL subdirectory. Serve `.wasm` as `application/wasm` and support byte ranges for video seeking. Opening `index.html` directly with `file://` is unsupported.

The output includes JavaScript, CSS, CanvasKit, a licensed font, images, recordings, and `export.json`. Re-exporting replaces an existing Legend Slides export only after compilation succeeds. Source directories and unrelated nonempty destinations are rejected. Assets must stay inside the deck directory, including symlink targets.

Use the arrows, Space, or Page Up/Down to navigate reveal steps. Home/End jump to the beginning/end; N toggles speaker notes; F toggles fullscreen. The slide picker jumps directly to a slide. Links such as `#18/4` restore a slide and reveal step, including on reload.

## Browser behavior

The existing MDX compiler, slide renderer, shared elements, and playback controller are reused. React Native Web, Reanimated's web backend, Uniwind, and React Native Skia's CanvasKit backend provide browser rendering. There is no custom graphics engine, rendering worker, or product frame loop. The web export uses the libraries' JavaScript scheduling, as authorized for this browser target; native animation policy and behavior remain unchanged.

Web adapters handle DOM text measurement, scaled layouts, DOM captures through `html-to-image`, and muted HTML video. Unsupported native features degrade as follows:

| Native feature | Web export |
| --- | --- |
| TypeGPU worklet renderer | Omit its decorative effect; preserve surrounding content |
| Runtime shader image filters | Preserve the filter input and other supported effects |
| Native shader slide transitions | Cut between slides; retain supported reveal and layout animation |
| Text-to-path conversion | Draw the text with Skia text |
| System font matching inside Skia | Use bundled Roboto |
| Native code block | Plain formatted code |

Recorded demos retain their original frame rates and codec requirements. Chromium on macOS played the ReactCon `.mov` and `.mp4` files; other browsers may need media transcoding. This exporter does not transcode recordings.

## Validation

```sh
bun test packages/slides-web/tests
bun run test:slides
bun run typecheck
```

Install `tests/browser-audit.js` in the exported page's browser console, then await `runSlidesAudit({ start: 0, count: 8 })`. Repeat in batches through all reveal states. Keep the tab visible or recording: an offscreen browser can throttle animation frames even when `document.visibilityState` says `visible`. Results accumulate in `window.__slidesAudit`. The audit is test instrumentation and is not bundled into the site.

See [ReactCon validation](REACTCON_VALIDATION.md) for measured results and limitations. The export has **not passed the requested universal 60 fps target**.
