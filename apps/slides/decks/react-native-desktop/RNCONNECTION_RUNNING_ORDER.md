# RN Connection running order

32 main slides · 5 backups · provisional 20-minute slot.

| Slide | Time | Title |
| --- | --- | --- |
| 1 | 0:00–0:25 | React Native is the best way to build desktop apps |
| 2 | 0:25–1:20 | These are apps I wanted to exist. |
| 3 | 1:20–2:00 | Fast to open. Fast to do something. |
| 4 | 2:00–2:15 | I built a chat history app. |
| 5 | 2:15–2:30 | Then I built it nine times. |
| 6 | 2:30–2:45 | Same app. Nine implementations. |
| 7 | 2:45–3:00 | Measure what the user sees. |
| 8 | 3:00–3:35 | Start with almost nothing. |
| 9 | 3:35–4:20 | Now load a real conversation. |
| 10 | 4:20–5:05 | 52.8 MiB. Doing the actual work. |
| 11 | 5:05–5:35 | Then interact with it. |
| 12 | 5:35–6:05 | Open the next conversation. |
| 13 | 6:05–6:35 | Small enough to ship comfortably. |
| 14 | 6:35–7:25 | The combination is what matters. |
| 15 | 7:25–8:00 | Fast. Low memory. Native UI. |
| 16 | 8:00–8:50 | React is composing a native application. |
| 17 | 8:50–9:25 | Keep the big data native. |
| 18 | 9:25–10:00 | No WebView required. |
| 19 | 10:00–11:00 | Native means behavior, too. |
| 20 | 11:00–11:40 | I haven't even counted React yet. |
| 21 | 11:40–12:25 | React Native everywhere. |
| 22 | 12:25–13:00 | The ecosystem can come with us. |
| 23 | 13:00–13:40 | Every app needs the rest of desktop. |
| 24 | 13:40–14:20 | Introducing Legend Framework. |
| 25 | 14:20–15:05 | Start quickly. Add native code when needed. |
| 26 | 15:05–15:50 | Give React the desktop tools. |
| 27 | 15:50–16:30 | Early. Useful. Building toward more. |
| 28 | 16:30–17:00 | One more app. |
| 29 | 17:00–17:50 | Legend Slides is a React Native app. |
| 30 | 17:50–18:35 | Legend Slides · 0.0.1 |
| 31 | 18:35–19:15 | Build something that belongs on desktop. |
| 32 | 19:15–20:00 | A first choice for desktop. |
| 33 | Backup | Hello World / memory |
| 34 | Backup | Hello World / installed size |
| 35 | Backup | What this comparison does—and does not—say. |
| 36 | Backup | Native content is not the same as a native window. |
| 37 | Backup | Legend Markdown / native authoring |

## Media and release preparation

Slides 4–6 now form a shared-element hero → grid → looping filmstrip sequence.
Media is intentionally represented by labeled slots until Jay supplies assets.
`NineApps.tsx` owns the slots; add deck-local screenshot imports to its
`screenshots` map. Supply one RN video and nine matching app screenshots. The
RN screenshot should match the video's final frame. Video playback is not wired
until the clip arrives; there is no simulated footage or private benchmark video.

The filmstrip holds for 2.8 seconds, moves for 1.1 seconds, and wraps offscreen.
The centered card is largest; neighbors shrink and dim. First advance freezes
it; second advance continues to methodology. Previews remain static. Native
transition appearance still needs rehearsal in Slides. The existing app-demo
clips on slides 2 and 19 also remain pending.

The 0.0.1 announcement is planned launch copy. Verify public release availability
and GitHub destinations before presenting; the speaker notes mark this dependency.
Windows status and public SDK availability must be refreshed before the talk.

Benchmark values are copied from the September 17 report into
`rnconnection-assets/benchmarks.json`. All nine chat implementations and nine
greeting implementations are retained. Size and timing revisions are labeled
separately. The report snapshot is included beside the data; the old deck and its
benchmark.ts are not dependencies.

## Validation

- Real Legend Slides compiler: 37 slides, zero errors, zero warnings.
- Repository `bun run typecheck`: passed.
- All 37 slides have speaker notes; data includes nine chat and nine greeting apps.
- Native inspection attempted with an app-scoped agent-device session. Snapshot
  and screenshot requests timed out; no native visual or navigation verification
  is claimed. Rehearse the actual app before presenting.

September 18: excluded Legend Shell as a duplicate RN host. The original report
snapshot preserves provenance; presentation data uses nine frameworks. RN Hello
World size is now 7.2 MiB after the September 18 optimized ARM64 rebuild
(7,499,962 bytes; symbol stripping, dead-code stripping, ThinLTO, and -Oz). Timing/memory retain the original controlled run; the original
report snapshot is archived evidence. Timing/memory have not been replaced by the later RN-only checks. Both existing RN binaries were verified ARM64-only.

Chat History's size chart uses app-bundle bytes only, excluding external grammar
packs for every framework. All nine current bundles were remeasured; exact bytes
and build dates are in `rnconnection-assets/chat-installed-sizes.json` (the chart
uses `appBytes`, not `combinedInstalledBytes`). RN is 17.8 MiB app-only. Separate
grammars remain recorded for provenance but are not plotted. Performance
measurements are unchanged.
