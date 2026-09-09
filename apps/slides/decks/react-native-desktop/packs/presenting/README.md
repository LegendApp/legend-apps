# Presenting pack

Reusable explanation tools. Import from `./packs/presenting` in the talk or copy
this folder into another deck. These are local pack prototypes; no installation
or native dependency changes are needed. They use ordinary visual props. Connect
those props to slide navigation with `Steps` render functions.

## Spotlight and anchored callouts

```tsx
<AttentionStage style={{ width: 1680, height: 580 }}>
  <AttentionTarget id="parser"><ParserDiagram /></AttentionTarget>
  <Spotlight target={focusParser ? "parser" : undefined} />
  <Callout target="parser" side="below">Only request visible rows.</Callout>
</AttentionStage>
```

Targets use unique IDs within their stage. The stage measures its native targets
relative to itself, including transforms and scaled presenter/projector views.
`Spotlight` animates a rounded cutout between targets; `darkness` and `padding`
control its dimming and clearance. An absent target removes the spotlight.
`Callout` draws an arrow and label; `side` accepts above/below/left/right, and
`width` controls the label. Labels are clamped inside the stage. Put overlays
after content in the stage. Missing or unmounted targets produce no callout.
Native measurement updates while the stage is mounted, at a lower rate in previews.

## Freeze and annotate

```tsx
<FreezeFrame paused={paused} annotation={<Annotations />}>
  {(seconds) => <Orbit time={seconds} />}
</FreezeFrame>
```

The supplied seconds stop when paused and resume from the same value. Feed them
to transforms, shader uniforms or a controlled Lottie `progress`. This does not
pause autonomous animations, videos, or timers inside arbitrary children.
Annotations fade in while paused. Slides reset the clock on re-entry; previews
use deterministic `previewTime` (default 1.5 seconds). The content stays mounted.

## Progressive detail

```tsx
<ProgressiveDetail expanded={expanded} summary={<SimpleDiagram />}
  detail={<Implementation />} style={{ width: 1680, height: 580 }} />
```

Expanding shrinks the summary to 37% width and opens the detail beside it. Both
remain mounted. Detail content should have a reasonable intrinsic/minimum width
so it does not reflow into a tall column during expansion.

## Comparison wipe

```tsx
<ComparisonWipe position={position} before={<Original />} after={<Refined />}
  beforeLabel="Original" afterLabel="Refined"
  style={{ width: 1680, height: 580 }} />
```

`position` is clamped to 0–1 and animates the divider. The after image occupies
the left side; the before image remains on the right. Both render at full size
and are clipped, never squeezed. Labels remain visible. The divider is currently
controlled by props, not draggable. Supply aligned, noninteractive illustrations.

## Code walkthrough

```tsx
<CodeWalkthrough source={code} lines={[4, 6]} explanation={<Explanation />} />
```

Line numbers are one-based and inclusive. The selected lines remain bright;
others fade to 25% opacity. Omitting `lines` shows the complete source. The code
pane scrolls to each selected range; `height` defaults to 580. This is a
monospaced source viewer with line emphasis, not a token syntax highlighter.

## Exploded layers

```tsx
<ExplodedLayers expanded={expanded} layers={[
  { id: "react", label: "React", content: <ReactDetails />, color: "#155e75" },
  { id: "native", label: "Native", content: <NativeDetails />, color: "#312e81" },
]} style={{ width: 1680, height: 580 }} />
```

Separates a stack into labeled rows with perspective, then reassembles it. Use
roughly 2–4 conceptual layers and give the stage enough height for their content.
This is an explanatory diagram, not a live decomposition of the native view tree.

## Content replacement

```tsx
<ContentSwap active={showTakeaway} before={<Chart />} after={<Takeaway />}
  duration={500} style={{ width: 1680, height: 580 }} />
```

Crossfades in one fixed area with a small scale change. Both branches stay mounted
so their state survives a round trip. Only the selected branch receives pointer
input or accessibility focus. Supply stage dimensions because both branches are
positioned absolutely. Child animations need their own playback control if they
should pause while hidden.

All prop-driven transitions reverse from their current value when interrupted.
Previews settle immediately into their requested state. `PresentingDemos.tsx`
contains talk-specific compositions; the pack components contain no slide numbers.
