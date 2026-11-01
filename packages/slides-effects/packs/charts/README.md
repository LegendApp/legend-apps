# Chart rows

Import `BarRow` from `slides:charts/BarRow`. Supply an `id` unique within the deck,
`name`, numeric `value`/`maximum` and `y`. Supply `valueLabel` or `valueContent` for
units or custom typography. `layout` overrides row, label, bar and value geometry;
`defaultBarRowLayout` preserves the desktop talk's dimensions.

Labels and values move as rigid shared elements while the bar changes width.
`highlighted`, `groupColor`, `grouped` and `tintText` are caller decisions.
Benchmark fixtures, grouping policy and metric formatting remain with the talk.
`ChartBar` can also be used alone. `NumberTiming` exports the presentation-clock
animation driver used by the host's number-flow integration; it does not ship
another digit renderer or an independent clock.

## Data visuals

Each visual takes the current step's values and animates to them on the shared step
clock; drive it from `<Steps>`. Text that changes every frame is drawn by Skia on the
UI thread; JavaScript only sets targets when the step changes.

```tsx
import { RenderTree } from "slides:charts/RenderTree";
import { AnimatedNumber, NumberCard } from "slides:charts/AnimatedNumber";
import { BarChart } from "slides:charts/BarChart";
import { LineChart } from "slides:charts/LineChart";

<Steps count={4}>{step => <RenderTree step={step}
  nodes={[{ id: "app", label: "App" }, { id: "list" }, { id: "row" }]} edges={[["app", "list"], ["list", "row"]]}
  flashes={[undefined, "all", { subtree: "list" }, ["row"]]} />}</Steps>

<Steps count={3}>{step => <NumberCard label="Operations" value={[20160, 10040, 40][step]} from={0}
  baselines={[{ label: "Baseline", value: 20160 }, { label: "Previous", value: 10040 }]} tag={step ? "-99.8%" : undefined} />}</Steps>

<BarChart data={[{ label: "Scan", value: 48000 }, { label: "Cached", value: 3 }]} scale="log" maximum={100000} suffix=" µs" />
<BarChart data={rows} scale={{ break: [200, 9000] }} maximum={10000} callout={{ label: "Service D", text: "800× less" }} />
<LineChart series={[{ points: datasets[step] }]} maximum={60} reference={{ value: 16.7, label: "16.7 ms" }} />
```

- `RenderTree` lays out `nodes` and parent→child `edges` (one parent per node). Each
  `flashes` entry is `"all"`, a list of ids or `{ subtree: id }`. Nodes rendering on the
  current step pulse top-down; badges and the total count every render up to `step`.
- `AnimatedNumber` ticks from the shown value to `value` with `decimals`, `prefix`,
  `suffix` and `separator`; `from` counts in on first appearance. Its width defaults
  to the widest value shown so far. `NumberCard` adds a label, an accent `tag` and up
  to two labeled `baselines`.
- `BarChart` bars and values grow on entry and between steps. `scale` is `"linear"`,
  `"log"` (powers of ten from `minimum`) or `{ break: [from, to] }`, which drops the
  empty span between two values and cuts the bars that cross it. Tiny values keep a
  4 px bar and a readable value; `highlight` and `callout` point at one bar.
- `LineChart` eases every point to the new dataset. Keep the series and point counts
  fixed across steps and set `maximum` so the axis holds still.
- `DataGeometry` exports the pure layout, count, axis and formatting helpers.
