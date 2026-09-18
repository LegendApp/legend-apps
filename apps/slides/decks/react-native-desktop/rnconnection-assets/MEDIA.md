# RN Connection media to capture

The deck uses `transition: fade`. Diagram elements only fade in; no content translates upward.
The existing Chat History image is the only actual app screenshot currently in the deck.
All missing media are explicitly labeled on the slides. Diagram windows are schematics,
not screenshots or claims of completed platform support.

| Slide | Needed media | Capture brief |
| --- | --- | --- |
| Apps I wanted to exist | Three video clips | Music: play and queue; Code: large file and scroll; Diff: open and navigate changes. About 10–15 seconds each, real speed |
| Fast to open / use | Video | Launch Chat History, open a large conversation, scroll. Real speed; avoid implying controlled timing from this demo |
| I built it nine times | Eight screenshots | AppKit, SwiftUI, Electron, Tauri, Deno WebView, Deno CEF, Flutter, GPUI. Same synthetic conversation and comparable viewport. RN already has an image |
| Native behavior | Video | Drop a file into Diff; operate Music with media keys |
| And then you get React | Video | Source edit alongside the app, showing Fast Refresh |
| Desktop tools for React | Video | Open menu, invoke file dialog, open a second window |
| Legend Slides | Video | Presenter and audience windows, then live source editing |
| Legend Slides 0.0.1 | Screenshot | Actual public release page once published; verify destination/version |
| Legend Markdown (backup) | Video | Edit a block, format a selection, save |

Use local synthetic/demo data. Keep assets under this deck directory so its compiler
can resolve them. Replace `MediaSlot` with the final image/video component once the
asset is available; it is a presentation placeholder, not a disabled video player.

Diagrams now cover architecture, native data ownership, shared platform logic,
desktop services, rendering models, benchmark timing, and development-to-shipping.
Measured charts and the full comparison backup retain the original benchmark values.
