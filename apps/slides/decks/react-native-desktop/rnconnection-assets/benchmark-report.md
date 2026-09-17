# Desktop framework comparison report

September 17, 2026 · macOS · Apple M4 · ARM64

This project compares nine implementations of a chat-history browser and ten Hello World apps. The chat workload browses the same pinned transcripts with Markdown and syntax highlighting; Hello World isolates the overhead of opening a window and showing a greeting. These results describe the implementations in this repository, rather than a universal ranking of frameworks.

## How to read the numbers

**The size and performance columns describe different build revisions.** Sizes are from the latest rebuilds, with external grammar packs and ARM64-only Flutter binaries. Timing and memory are from the last complete controlled benchmark, before those packaging changes, the sidebar styling update, and the composer blur changes (including GPUI’s native overlay). They are presented together for reference; the current builds still need a full timing and memory rerun. The later one-iteration smoke checks are not substituted for that benchmark.

- **Times:** median milliseconds across ten measured rounds after two discarded warmup rounds, with rotating app order. Window and first-content times start at process launch; jump and switch times start at their respective actions. Visible timings come from recordings, not app-reported completion events.
- **Memory:** median settled physical footprint in MiB, from separate unrecorded launches, including attributed helper processes. This is not RSS or peak memory.
- **Size:** logical installed MiB (1,048,576 bytes), excluding duplicate symlink targets and system frameworks. “App” excludes external grammars; “total” includes the entire required pack, even when another app can share it. These are not compressed download sizes.
- **Environment:** Apple M4, macOS 26.6.1; fresh processes with warm filesystem caches. The performance run used committed release builds. The latest size snapshot includes uncommitted source changes.

**UI categories describe the app content, not the window border.** Native means platform views/text rendering (including SwiftUI and React Native macOS). Web means HTML/CSS in WebKit or Chromium. Canvas means framework-drawn, GPU-rendered widgets, not an HTML canvas. All three approaches can use native windows and operating-system services. The language column describes application code, not every language inside its dependencies.

## Chat history — size, startup, and memory

Current sizes are paired with the earlier controlled performance measurements as explained above. Rows follow first-content time in that measured run.

| App | App language | UI | App MiB | Pack MiB | Total MiB | Window ms | First content ms | Initial memory MiB |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AppKit | Swift | Native | 3.2 | 1.3 | 4.5 | 226.9 | 318.9 | 42.4 |
| GPUI | Rust + Objective-C composer | Canvas + native composer | 9.9 | 0.8 | 10.7 | 226.4 | 335.5 | 289.0 |
| React Native | TypeScript / React; C++ native modules | Native | 19.7 | 22.5 | 42.2 | 243.4 | 406.3 | 52.8 |
| Tauri | TypeScript / React + Rust | Web | 11.5 | 0.1 | 11.6 | 244.0 | 544.0 | 363.5 |
| SwiftUI | Swift | Native | 3.7 | 1.3 | 5.0 | 268.7 | 668.8 | 82.6 |
| Flutter | Dart | Canvas | 21.6 | 0.6 | 22.1 | 244.3 | 1094.0 | 340.7 |
| Deno WebView | TypeScript / React | Web | 65.8 | 0.1 | 65.9 | 419.2 | 1268.9 | 408.1 |
| Electron | TypeScript / React | Web | 285.6 | 0.1 | 285.7 | 261.0 | 1277.7 | 477.5 |
| Deno CEF | TypeScript / React | Web | 307.8 | 0.1 | 307.9 | 310.4 | 1294.4 | 616.9 |

### Chat interactions and later memory

Jump moves to the top of the initial transcript. Switch opens the second pinned transcript. These are the same controlled run as the startup columns.

| App | Jump ms | Switch ms | Memory at top MiB | Memory after switch MiB |
| --- | ---: | ---: | ---: | ---: |
| AppKit | 79.1 | 88.3 | 49.0 | 49.0 |
| GPUI | 50.5 | 193.1 | 291.1 | 309.9 |
| React Native | 45.0 | 157.7 | 57.8 | 66.5 |
| Tauri | 70.6 | 218.9 | 370.3 | 394.1 |
| SwiftUI | 68.9 | 554.6 | 83.4 | 93.2 |
| Flutter | 80.2 | 625.9 | 337.1 | 265.6 |
| Deno WebView | 72.9 | 657.0 | 415.7 | 582.4 |
| Electron | 70.5 | 679.0 | 476.2 | 445.8 |
| Deno CEF | 70.5 | 670.1 | 618.0 | 580.8 |

## Hello World

Legend Shell is the greeting app hosted by the Legend Apps React Native shell; the other React Native row is the standalone baseline. Neither requires a grammar pack. All Hello World app sizes therefore equal their combined installed sizes.

| App | App language | UI | App MiB | Window ms | First content ms | Memory MiB |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| AppKit | Swift | Native | 0.1 | 193.4 | 193.4 | 15.5 |
| GPUI | Rust | Canvas | 5.3 | 210.7 | 226.5 | 56.3 |
| Legend Shell (RN) | TypeScript / React | Native | 9.3 | 218.3 | 227.5 | 23.9 |
| SwiftUI | Swift | Native | 0.1 | 210.9 | 227.5 | 18.3 |
| React Native | TypeScript / React | Native | 16.3 | 210.9 | 227.6 | 23.3 |
| Flutter | Dart | Canvas | 17.0 | 234.4 | 259.2 | 55.0 |
| Electron | TypeScript / React | Web | 285.1 | 277.6 | 344.5 | 83.4 |
| Deno CEF | TypeScript / React | Web | 307.0 | 359.3 | 360.0 | 203.6 |
| Deno WebView | TypeScript / React | Web | 65.0 | 360.9 | 394.1 | 83.0 |
| Tauri | TypeScript / React + Rust | Web | 10.3 | 377.5 | 409.8 | 73.0 |

## What this comparison shows

In the controlled chat run, AppKit had the lowest median first-content time and initial memory footprint. GPUI was close on first content but used substantially more memory. React Native opened the transcript ahead of the web stacks and had the lowest median jump time; AppKit had the lowest switch time. These observations do not establish that one framework is intrinsically faster for other applications.

Current app-only sizes favor frameworks that rely on system components. Externalizing assets changes where their bytes are counted: React Native’s 19.7 MiB app still needs a 22.5 MiB grammar pack. Flutter’s ARM64-only rebuild reduced its chat bundle from 42.9 to 21.6 MiB and Hello World from 33.6 to 17.0 MiB. Rounding individual columns can make their displayed sum differ by 0.1 MiB from the separately rounded total.

Small Hello World differences near the recording cadence should be treated as effectively tied. The [full performance report](../benchmarks/final-2026-09-17/RESULTS.md) includes p90 values and measurement limitations.

## Screenshots and framework tradeoffs

These are actual September 17 recordings after the composer blur update of a long synthetic chat scrolled to the top, with text continuing behind the composer. Each frame is taken 600 ms after the top-viewport event. The same prose, lists, and TypeScript code appear in all nine apps; this is visual evidence, not the private benchmark corpus. Flutter is ARM64-only. The web/canvas apps have plain sidebars; native stacks retain their split-view treatment.

### Composer material comparison

| Apps | Composer effect | Blurs the chat beneath it? |
| --- | --- | --- |
| React Native, AppKit, SwiftUI | Native Liquid Glass, regular style (`NSGlassEffectView`) | Yes |
| Electron, Tauri, Deno WebView, Deno CEF | CSS backdrop blur, 10 px, saturation 1.2 | Yes |
| Flutter | Gaussian `BackdropFilter`, sigma 10 | Yes |
| GPUI 0.2.2 | Native Liquid Glass overlay above the GPU-rendered chat | Yes |

Native Liquid Glass is more than Gaussian blur. Conventional web and Flutter blur can soften underlying text but do not reproduce the system material's full behavior. Static dark-mode images may make these differences subtle, so each screenshot is labeled by its actual implementation.

**Rendering distinction:** GPUI now hosts a native glass composer; its transcript remains canvas-rendered. All apps blur the text beneath the composer, but CSS/Flutter Gaussian blur and native Liquid Glass have different rendering behavior and costs. The earlier timing tables predate the new GPUI overlay. See the [material audit](COMPOSER_MATERIALS.md) for settings and validation.

The short pros and cons below are engineering assessments, informed by the implementation and linked framework documentation; they are not additional benchmark measurements.

### React Native macOS

A React/TypeScript interface hosted by React Native macOS, backed by AppKit views and native text rendering. This app also uses C++ document/grammar code. [React Native macOS documentation](https://microsoft.github.io/react-native-macos/).

![React Native macOS chat-history app showing a long synthetic chat behind the composer](report-assets/react-native.png)

*Composer: Native Liquid Glass. Long chat shown behind the input surface.*

**Pros:** React’s component model with native macOS views; reusable React/TypeScript application code. This implementation combines relatively low chat memory with responsive navigation.

**Cons:** Native integrations still require platform expertise and dependency compatibility work. The JavaScript/native layers add moving parts, and this app’s grammar library is a material part of its installed footprint.

### Electron

The React interface renders in bundled Chromium, with a Node.js host. [Electron documentation](https://www.electronjs.org/docs/latest).

![Electron chat-history app showing a long synthetic chat behind the composer](report-assets/electron.png)

[View the light-mode composer](report-assets/electron-light.png)

*Composer: CSS backdrop blur. Long chat shown behind the input surface.*

**Pros:** A bundled browser gives developers control over the rendering version; HTML/CSS and the JavaScript ecosystem support complex interfaces and shared web code.

**Cons:** Bundling Chromium and Node.js increases distribution size. This implementation also has higher settled memory than the native-view apps; host/renderer communication needs explicit design.

### Tauri

The React interface renders in the system WebView, with a Rust host; on this Mac the renderer is WebKit. [Tauri architecture](https://v2.tauri.app/concept/architecture/) and [WebView versions](https://v2.tauri.app/reference/webview-versions/).

![Tauri chat-history app showing a long synthetic chat behind the composer](report-assets/tauri.png)

[View the light-mode composer](report-assets/tauri-light.png)

*Composer: CSS backdrop blur. Long chat shown behind the input surface.*

**Pros:** A small application bundle because the browser engine comes from the operating system; combines web UI development with Rust backend code.

**Cons:** Rendering behavior depends on the system WebView and therefore needs testing across OS versions. A small bundle does not guarantee low runtime memory: this chat app still uses WebKit helper processes.

### Deno Desktop — WebView

This repository’s Deno Desktop build pairs a TypeScript backend and React frontend with the system WebView. It shares the application logic with the CEF variant. [Implementation notes](../benchmarks/chat-history/README.md#running-deno-desktop).

![Deno Desktop — WebView chat-history app showing a long synthetic chat behind the composer](report-assets/deno-webview.png)

[View the light-mode composer](report-assets/deno-webview-light.png)

*Composer: CSS backdrop blur. Long chat shown behind the input surface.*

**Pros:** TypeScript on both sides of the application; avoids bundling Chromium and is substantially smaller than the CEF variant here.

**Cons:** Requires the Deno Desktop-capable toolchain used by this repository, plus WebView compatibility and permissions management. Its packaged runtime remains larger than this Tauri build, and its measured chat startup was slower.

### Deno Desktop — CEF

The same Deno/React application runs with a bundled Chromium Embedded Framework renderer. [Implementation notes](../benchmarks/chat-history/README.md#running-deno-desktop).

![Deno Desktop — CEF chat-history app showing a long synthetic chat behind the composer](report-assets/deno-cef.png)

[View the light-mode composer](report-assets/deno-cef-light.png)

*Composer: CSS backdrop blur. Long chat shown behind the input surface.*

**Pros:** Keeps the TypeScript application structure while bundling a Chromium renderer instead of depending on the system WebView version.

**Cons:** The renderer adds a large distribution payload. This variant had the highest initial chat memory and the largest current chat bundle in this comparison.

### Flutter

Dart widgets draw through Flutter’s rendering engine rather than mapping the content UI to AppKit controls. [Flutter architecture](https://docs.flutter.dev/resources/architectural-overview).

![Flutter chat-history app showing a long synthetic chat behind the composer](report-assets/flutter.png)

[View the light-mode composer](report-assets/flutter-light.png)

*Composer: Gaussian backdrop blur. Long chat shown behind the input surface.*

**Pros:** A composable widget system and framework-owned rendering support consistent custom UI across platforms. The ARM64-only bundles are much smaller than the earlier universal builds.

**Cons:** Native macOS appearance and behavior need deliberate adaptation or integration. The engine is shipped with the app; this implementation’s measured chat startup and memory exceed the native-view apps.

### GPUI

Rust application code uses GPUI’s GPU-rendered elements; this benchmark uses GPUI 0.2.2. Its transcript and sidebar are canvas-rendered; its composer now uses a macOS-native Liquid Glass overlay. [GPUI documentation](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md).

![GPUI chat-history app showing a long synthetic chat behind the composer](report-assets/gpui.png)

[View the light-mode composer](report-assets/gpui-light.png)

*Composer: Native Liquid Glass overlay. Long chat shown behind the input surface.*

**Pros:** Direct control over layout, rendering, and data structures without a browser runtime. This implementation has a small bundle and competitive measured first-content time.

**Cons:** More responsibility for custom UI behavior and platform integration. GPUI remains pre-1.0 with breaking API changes; this app’s memory footprint is higher than the AppKit, SwiftUI, and React Native versions.

### SwiftUI

A declarative Swift interface using Apple’s native UI framework, with AppKit interoperability where needed. [SwiftUI documentation](https://developer.apple.com/documentation/swiftui).

![SwiftUI chat-history app showing a long synthetic chat behind the composer](report-assets/swiftui.png)

*Composer: Native Liquid Glass. Long chat shown behind the input surface.*

**Pros:** Concise composition, integration with Apple-platform controls and services, and a small bundle that reuses system frameworks.

**Cons:** Targets Apple platforms. Framework-managed layout and update behavior can require profiling or AppKit interop for precise control; this implementation’s switch time was materially slower than AppKit’s.

### AppKit

A Swift application built directly with AppKit’s macOS views, text system, and window infrastructure. [AppKit documentation](https://developer.apple.com/documentation/appkit).

![AppKit chat-history app showing a long synthetic chat behind the composer](report-assets/appkit.png)

*Composer: Native Liquid Glass. Long chat shown behind the input surface.*

**Pros:** Direct control over macOS view lifecycles, layout, and desktop behavior. This implementation has the smallest chat app bundle, lowest initial memory, and fastest measured first content.

**Cons:** The UI is macOS-specific. Explicit view management and layout can require more implementation work than a declarative framework; its advantage here cannot be assumed for every native application.

## Reproduction and evidence

- [Build and benchmark instructions](../README.md#build-then-benchmark).
- [Latest build-size table](../benchmarks/BUILD_SIZES.md) and [exact bytes/build provenance](../benchmarks/BUILD_SIZES.json).
- [Controlled timing/memory results, p90, and conditions](../benchmarks/final-2026-09-17/RESULTS.md).
- [Fairness standard](../benchmarks/chat-history/FAIRNESS_STANDARD.md) and [external grammar design](../benchmarks/chat-history/EXTERNAL_GRAMMARS.md).
- [External grammar validation](../benchmarks/chat-history/EXTERNAL_GRAMMARS_VALIDATION.md). The report screenshots are copied beside this document so they remain available when the repository is cloned; the original videos and raw benchmark files referenced by the validation documents remain local, ignored evidence.

The full benchmark uses local pinned histories, which are not distributed with these apps. The screenshots’ synthetic transcript is a visual validation fixture, not the corpus used to produce the timing tables. Equivalent workloads and enabled parsing/highlighting do not imply identical tokenization, layout, pixels, or engine internals.
