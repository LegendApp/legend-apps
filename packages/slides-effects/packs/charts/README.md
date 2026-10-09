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
