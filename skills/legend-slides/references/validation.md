# Validation and delivery

## Authoring without a native build

A deck is a directory containing `.mdx` plus its local dependencies. An installed
skill is authoring guidance, not the app or its compiler dependencies. When a
Legend Apps checkout with dependencies installed and Bun is available:

```sh
bun /path/to/legend-slides/scripts/validate-deck.ts /path/to/deck.mdx /path/to/legend-apps
```

The last argument defaults to the current directory. The validator calls the
checkout's real compiler and prints JSON with success, errors/warnings and slide
count. Exit 0 means compilation succeeded; exit 1 means compiler errors; exit 2
means usage/setup failure. Warnings need review even with exit 0. The compiler
processes trusted local code and assets but does not mount the deck in the app.

The repository also has:

```sh
bun scripts/compile-slides.ts /path/to/deck.mdx
```

That command writes a gzip-base64 JSON envelope. Decode `data` and inspect the
inner `success`, `errors`, and `warnings`; process exit alone does not establish
success. The bundled validator avoids this trap.

## Native check

From the checkout root, on configured macOS development tooling:

```sh
bun run slides run macos -- /absolute/path/to/deck.mdx
```

This is a development build/run command. Use the repository's runtime runbook
(`docs/agent-runtime.md`) and available app-scoped tooling for inspection. Do not
interrupt another agent's active automation session. Do not claim a screenshot
or animation check from compiler success alone.

Check initial and final steps, forward/backward navigation, any interrupted
animation, matching shared elements, notes, next-preview static state, clipping,
font/image availability, and captures/GPU/Webview content where used. A native
build can succeed while runtime compilation fails due to file access. Inspect
the actual error and macOS permission prompt; do not assume a blanket permission
grant is needed.

Saves compile automatically. An open audience locks deck updates: use Apply Update
Now for a queued build, or Unlock Live Updates for later saves. A failed rebuild
keeps the previous successful deck, so seeing a slide is not proof the new build
loaded. In Edit Source, drafts compile after a pause; save them explicitly.

## Examples in a checkout

- `apps/slides/examples/demo.mdx`: minimal deck.
- `apps/slides/examples/showcase.mdx`: native components and executable code.
- `apps/slides/examples/layouts.mdx`: nested groups, columns, grids, reveals.
- `apps/slides/examples/shared.mdx`, `focus.mdx`: motion between slides.
- `../legend-talks/react-native-desktop/effects.mdx`: one demo per effect.

The installed skill carries `assets/starter.mdx`; it does not carry all those
checkout examples or their native dependencies.

## Scope of validation

For content changes, compile and inspect relevant slides. For host/compiler code
changes, also run `bun run test:slides`, `bun run typecheck`, and
`bun run slides verify macos` in the checkout. Release builds and publishing are
separate work. Current release apps still depend on the checkout compiler path
and Bun; do not promise a standalone portable application or automatic PPTX/PDF
export. Deliver the deck path, dependencies, validation performed, and any runtime
checks that remain unavailable.

## Maintaining these references

Verify configuration in `packages/presentation/src/types.ts`, parser behavior in
`packages/presentation/src/compiler`, layouts in `packages/presentation/src/layout.ts`,
and native mappings in `apps/slides/src/DeckRenderer.tsx`. Effect, LiquidGlass,
TypeGPU and Webview prop types live beside that renderer. Prefer installed code
and tests when this bundled reference disagrees with a different checkout version.
