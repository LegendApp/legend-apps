# Legend Slides web export

Export ReactCon from the repository root:

```sh
bun packages/slides-web/export.ts ../legend-talks/react-native-desktop/reactcon.mdx --out dist/reactcon
```

Open `dist/reactcon/index.html` directly from disk (`file://`), with no server or network. The same folder works on a static HTTP host, including under a URL subdirectory. Hosts should support byte ranges for video seeking.

Source maps stay in the local temporary cache `legend-slides-web/<SHA256 of absolute output path>/player.js.map` for debugging (`exportDebugDirectory(output)` returns the path). They are not included in the published folder, and the player contains no source-map URL.

The output includes JavaScript, CSS embedded in `index.html`, local media and `export.json`. Decks using Skia also include CanvasKit and a licensed font. CanvasKit is loaded only for those decks; non-Skia decks ship no CanvasKit binary. The local WASM binary is encoded in a classic script, and fonts use data URLs, so browser file URL restrictions do not require disabling browser security. This encoding increases the local WASM payload by one third. Re-exporting replaces an existing Legend Slides export only after compilation succeeds. Source directories and unrelated nonempty destinations are rejected. Assets must stay inside the deck directory, including symlink targets.

For hosted exports, share a CanvasKit WASM URL between decks:

```sh
bun packages/slides-web/export.ts deck.mdx --out dist/deck --canvaskit-url https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/canvaskit.wasm
```

The URL must serve the matching CanvasKit version with CORS enabled and `application/wasm`. This option requires network access and omits the local binary. Offline folders use their own copy by default.

The exporter follows embedded HTML, stylesheets, JavaScript modules, static fetch/URL references, fonts, images, srcsets and media. Browser modules are bundled into classic scripts; stylesheet fonts and fetch data are embedded where file URL rules require it. Missing local files, directory escapes and computed fetch URLs fail with a source diagnostic. Use static URLs or embed dynamically selected data. Remote URLs are retained and listed in `export.json` (`remoteURLs` and `warnings`); those resources require network access. Exported CSS also scans the normally resolved installed effect packs.

Use the arrows, Space, or Page Up/Down to navigate reveal steps. Home/End jump to the beginning/end; N toggles speaker notes; F toggles fullscreen. The slide picker jumps directly to a slide. Links such as `#18/4` restore a slide and reveal step, including on reload.

Speaker notes open in a sidebar by default on slides that have notes. Use the Notes button, N, or the sidebar's close button to hide or show it. Visibility is saved in local storage and survives reloads; slides without notes hide both the sidebar and its toggle without changing that preference. Numbered notes follow the active reveal step and scroll into view in either navigation direction. Inactive steps start faded, while unnumbered notes remain fully visible.

## Browser behavior

The existing MDX compiler, slide renderer, shared elements, and playback controller are reused. React Native Web, Reanimated's web backend, Uniwind, and React Native Skia's CanvasKit backend provide browser rendering. There is no custom graphics engine, rendering worker, or product frame loop. The web export uses the libraries' JavaScript scheduling, as authorized for this browser target; native animation policy and behavior remain unchanged.

Web adapters handle DOM text measurement, scaled layouts, DOM captures through `html-to-image`, and muted HTML video. Unsupported native features degrade as follows:

| Native feature | Web export |
| --- | --- |
| TypeGPU shaders | Render through the WebGPU Canvas adapter and Reanimated's web scheduling; omit the effect when WebGPU is unavailable |
| Runtime shader image filters | Preserve the filter input and other supported effects |
| Native shader slide transitions | Cut between slides; retain supported reveal and layout animation |
| Text-to-path conversion | Draw the text with Skia text |
| System font matching inside Skia | Use bundled Roboto |
| Native code block | Plain formatted code |

TypeGPU requires a browser with WebGPU and a secure context: HTTPS for remote hosts, or HTTP on localhost. Plain HTTP Tailscale addresses preserve the slide content but omit TypeGPU effects. Shader programs, compute buffers, and particle rendering are shared with the native renderer; the native-only device synchronization feature is not requested on web. Previews remain static and outgoing effects freeze on their last frame.

Recorded demos retain their original frame rates and codec requirements. Chromium on macOS played the ReactCon `.mov` and `.mp4` files; other browsers may need media transcoding. This exporter does not transcode recordings.

On HTTP(S), a background queue preloads exported assets in slide order. Under `file://`, DOM elements load local resources directly and the HTTP download indicator is hidden. The exporter follows local component imports and includes companion recordings; assets whose use cannot be determined statically load last. Shared component modules are grouped conservatively, so some media may load earlier than its exact reveal step. Jumping to a slide prioritizes its media and subsequent slides, including assets shared with earlier slides.

The queue downloads one file at a time with low fetch priority and yields between files using the browser's background task scheduler (or a short timer fallback). It never waits before showing a slide or mounts hidden slide/video players. Completed images and videos are reused through blob URLs; an already mounted video keeps its source and playback position. Failed preloads fall back to normal loading when needed. Compressed media stays available for the page's lifetime, using approximately the exported media's file size in additional storage; decoding and rendering still happen through the existing libraries. Fetch priority is a browser hint, so network contention and media decoding can still affect transitions.

The bottom-right status shows preparation progress and becomes **Media ready** when all assets are available. Each exported asset has a content hash, and preload requests use that version in the URL with the browser's [cache-first fetch mode](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache). Subsequent visits can restore unchanged downloads from the HTTP cache without transferring them again; changed assets get a new URL on re-export. This works over HTTP, including the Tailscale preview address, without a service worker. Browsers may evict cached files, and private browsing or a host's `Cache-Control: no-store` can prevent persistence. Hosts should allow asset caching; the player and HTML should remain revalidatable.

## Validation

```sh
bun test packages/slides-web/tests
bun run test:slides
bun run typecheck
```

Install `tests/browser-audit.js` in the exported page's browser console, then await `runSlidesAudit({ start: 0, count: 8 })`. Repeat in batches through all reveal states. Keep the tab visible or recording: an offscreen browser can throttle animation frames even when `document.visibilityState` says `visible`. Results accumulate in `window.__slidesAudit`. The audit is test instrumentation and is not bundled into the site.

For sidebar checks, export `tests/fixtures/notes.mdx`, clear the `legend-slides:notes-visible` local storage key, and reload. Install `tests/notes-browser.js` in that page's console and await `testNotesSidebar()`. Also reload with the sidebar hidden and shown to verify persistence, and navigate a long set of numbered notes to verify scrolling.

Inspect `window.__legendSlides.preload` for preload progress and failures. Once complete, open image/video slides and verify their media uses blob URLs without further asset requests. Test navigation while the queue is active as well as after it finishes.

See [ReactCon validation](REACTCON_VALIDATION.md) for measured results and limitations. The export has **not passed the requested universal 60 fps target**.
