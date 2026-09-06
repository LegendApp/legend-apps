# Sources and excerpt provenance

Checked September 6, 2026. Speaker notes carry the specific qualifications for
each slide. The presentation's recommendation is an argument from this project,
not a universal framework ranking.

## Measurements

[benchmark-source.md](./benchmark-source.md) identifies the September 5 report,
raw observations and methodology. `benchmark.ts` contains all 45 values used by
the five charts: first content, switching, initial footprint, switched footprint
and bundle size. Comparisons of development effort are qualitative; no equivalent
engineering-hours experiment was recorded.

## Platform and workflow documentation

- [React Native macOS](https://microsoft.github.io/react-native-macos/): native macOS support built on AppKit.
- [React Native Windows](https://microsoft.github.io/react-native-windows/): native Windows support and setup.
- [Fast Refresh](https://reactnative.dev/docs/fast-refresh): component iteration and state-preservation limits.
- [Nitro Modules](https://nitro.margelo.com/): typed native interfaces with C++, Swift and Kotlin support.
- [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview): the Apple platform view, distinct from our Skia image filter.
- [React Native Skia](https://shopify.github.io/react-native-skia/): graphics library documentation.
- [TypeGPU](https://docs.swmansion.com/TypeGPU/): TypeScript shader authoring and WebGPU.
- [agent-device](https://github.com/callstack/agent-device): app inspection, interaction and evidence capture.

Agent CLI syntax was also checked with the installed **0.20.10** `help open` and
`help screenshot`. No app was launched or automated during this authoring pass.
The command slide is an example, not output from a completed verification run.

## Local source excerpts

The app/native excerpts were inspected in the sibling
`legend-apps-main-integration` checkout. This deck copies short excerpts as text
in `snippets.ts`; it does not import code outside the deck at runtime.

| Snippet | Source relative to that checkout | Editing for the slide |
| --- | --- | --- |
| `sidebar` | `apps/chat-history/src/App.tsx` | Selected split-view props and abbreviated child props; ellipses are explicit. |
| `native` | `packages/chat-history/src/ChatHistory.nitro.ts` | Selected `ChatDocument` members; other members omitted. |
| `cpp` | `packages/chat-history/cpp/HybridChatDocument.cpp` | Beginning of `getRowMetadata`; metadata construction omitted. |
| `glass` | `packages/glass-effect-view/ios/GlassEffectView.swift` | Selected `setupView` lines; remaining setup omitted. |
| `glassReact` | `packages/glass-effect-view/src/GlassEffectView.ts` | An authored usage example of the exported API, not an app source excerpt. |
| `accessibility` | `apps/chat-history/src/App.tsx` | `ChatSidebarRow` accessibility props; styling and children omitted. |
| `gpu` | This deck's `sidebarStorm.ts` | Actual vertex arithmetic and terminal draw call, shown as excerpts. |
| `deck` | This deck's `talk.mdx` | Abbreviated TypeGPU slide JSX. |

The native app structure also uses
`packages/appkit-split-view/ios/RNSidebarSplitViewComponent.mm`.
The Slides implementation is documented in `apps/slides/README.md`; its `Effect`
component captures content and its `TypeGPU` component owns GPU lifecycle.

## Visual evidence boundaries

Chat History artwork and the three sidebar designs are labeled illustrations or
schematics. They contain no private conversation text and are not attributed to
competitor screenshots. The glass escalation begins as a restrained custom Skia
approximation and then becomes intentionally excessive. The quiet reset shows real native source; Slides does not yet embed
`NSGlassEffectView`. The 384-sidebars scene is real TypeGPU shader code, without
an invented FPS or throughput claim.
