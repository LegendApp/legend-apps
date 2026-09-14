# Long-line layout optimizations

Measured on macOS with an optimized native AppKit/CoreText harness, September 14,
2026. These are isolated native operation timings, not running-Code frame times.
The harness uses real Tree-sitter token boundaries with a two-color test palette,
14-point monospace text, an 800-point width and 22-point row height. File reading,
parsing and token extraction are outside the timed operations.

Fixtures: Joi 17.13.3 `dist/joi-browser.min.js` (149,224 UTF-16 units, 54,269
tokens) and React Native debugger frontend 0.81.6
`dist/third-party/front_end/core/i18n/locales/en-US.json` (614,342 units,
17,418 tokens). Both fixtures are single logical lines.

| Operation | Joi before → after | JSON before → after |
| --- | --- | --- |
| First unwrapped geometry lookup | ~2,900 ms → 8–9 ms | ~11,500 ms → 18–20 ms |
| Full wrapped selection, painted into a 400-point viewport | ~35 ms → 0.41–0.45 ms | ~180–209 ms → 0.36–0.38 ms |
| Layout after an 8K foreground-color update | ~38 ms → 2.29–2.34 ms | ~51 ms → 2.02–2.09 ms |

After ranges are four repetitions. Selection requests still span the full logical
line; the new painting path computes only the 19 intersecting visual rows.
The update timing excludes building/applying attributes (another ~11 ms for Joi
and ~3 ms for JSON). It includes finding changed attribute ranges, reshaping
affected original typesetter chunks and checking that their metrics remain valid.

## Safety and remaining limits

- The caret index retains the original CoreText line. It handles simple ASCII
  clusters in fixed-pitch runs; proportional fonts, explicit kerning/ligatures,
  RTL and complex boundaries keep the original CoreText lookup. Index creation
  remains linear in logical-line size and consumes memory proportional to it.
- Wrapped updates retain unchanged chunks, including their original shaping
  context. Changed line breaks or metrics cause an atomic fallback to full
  layout. Unwrapped updates still rebuild their single CoreText line.
- Full theme/font changes can touch every chunk; these are not constant-time.
- Native geometry tests cover Unicode/bidi/ligatures, clipping, retained chunk
  identities, updated glyph-run attributes and rejected reflow updates.
  Run `bash packages/source-editor/tests/run-native.sh` for regression coverage.
- These changes require a native debug rebuild to test in Code, Diff or Slides.
