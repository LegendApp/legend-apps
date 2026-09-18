# RN Connection running order

31 main slides · 5 backups · provisional 20-minute slot.

| Slide | Time | Title |
| --- | --- | --- |
| 1 | 0:00–0:25 | React Native is the best way to build desktop apps |
| 2 | 0:25–1:20 | These are apps I wanted to exist. |
| 3 | 1:20–2:00 | Fast to open. Fast to do something. |
| 4 | 2:00–2:25 | I wanted to know how it compared. |
| 5 | 2:25–2:45 | So I built it nine times. |
| 6 | 2:45–3:00 | Measure what the user sees. |
| 7 | 3:00–3:35 | Start with almost nothing. |
| 8 | 3:35–4:20 | Now load a real conversation. |
| 9 | 4:20–5:05 | 52.8 MiB. Doing the actual work. |
| 10 | 5:05–5:35 | Then interact with it. |
| 11 | 5:35–6:05 | Open the next conversation. |
| 12 | 6:05–6:35 | Small enough to ship comfortably. |
| 13 | 6:35–7:25 | The combination is what matters. |
| 14 | 7:25–8:00 | Fast. Low memory. Native UI. |
| 15 | 8:00–8:50 | React is composing a native application. |
| 16 | 8:50–9:25 | Keep the big data native. |
| 17 | 9:25–10:00 | No WebView required. |
| 18 | 10:00–11:00 | Native means behavior, too. |
| 19 | 11:00–11:40 | I haven't even counted React yet. |
| 20 | 11:40–12:25 | React Native everywhere. |
| 21 | 12:25–13:00 | The ecosystem can come with us. |
| 22 | 13:00–13:40 | Every app needs the rest of desktop. |
| 23 | 13:40–14:20 | Introducing Legend Framework. |
| 24 | 14:20–15:05 | Start quickly. Add native code when needed. |
| 25 | 15:05–15:50 | Give React the desktop tools. |
| 26 | 15:50–16:30 | Early. Useful. Building toward more. |
| 27 | 16:30–17:00 | One more app. |
| 28 | 17:00–17:50 | Legend Slides is a React Native app. |
| 29 | 17:50–18:35 | Legend Slides · 0.0.1 |
| 30 | 18:35–19:15 | Build something that belongs on desktop. |
| 31 | 19:15–20:00 | A first choice for desktop. |
| 32 | Backup | Hello World / memory |
| 33 | Backup | Hello World / installed size |
| 34 | Backup | What this comparison does—and does not—say. |
| 35 | Backup | Native content is not the same as a native window. |
| 36 | Backup | Legend Markdown / native authoring |

## Media and release preparation

The deck is complete without external media: app introductions are native text
layouts and Chat History has a real report screenshot. Videos have not been
supplied or embedded. Add real-speed clips to slides 2, 4, and 18 when provided.
No fake app UI or fabricated video has been substituted.

The 0.0.1 announcement is planned launch copy. Verify public release availability
and GitHub destinations before presenting; the speaker notes mark this dependency.
Windows status and public SDK availability must be refreshed before the talk.

Benchmark values are copied from the September 17 report into
`rnconnection-assets/benchmarks.json`. All nine chat implementations and nine
greeting implementations are retained. Size and timing revisions are labeled
separately. The report snapshot is included beside the data; the old deck and its
benchmark.ts are not dependencies.

## Validation

- Real Legend Slides compiler: 36 slides, zero errors, zero warnings.
- Repository `bun run typecheck`: passed.
- All 36 slides have speaker notes; data includes nine chat and nine greeting apps.
- Native inspection attempted with an app-scoped agent-device session. Snapshot
  and screenshot requests timed out; no native visual or navigation verification
  is claimed. Rehearse the actual app before presenting.

September 18: excluded Legend Shell as a duplicate RN host. The original report
snapshot preserves provenance; presentation data uses nine frameworks. RN Hello
World size remains historical and explicitly marked pending symbol-stripped
rebuild. Both existing RN binaries were verified ARM64-only.
